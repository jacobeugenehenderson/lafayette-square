#!/usr/bin/env node
/**
 * "DOES EVERY READ WE MAKE OF WHAT IS IN THE BUCKET GET THE BUCKET, NEVER THE EDGE'S COPY?"
 *
 * WHY (Boz, 2026-10-30). The release steps had Jacob purge assets.theward.online/baked/ by hand after a Promote, so
 * that our own readers (the uploader's dirty check and index read, verify, the prod-slab backup, the compression gate)
 * would not read a cached copy. A step a person must remember is a fallback. Measured on that host: a request's
 * `cache-control: no-cache`, `max-age=0`, `pragma` and fetch's `cache: 'no-store'` are all ignored (a cached .png
 * stayed HIT); a query never seen before is a MISS. So every such read goes through ONE helper, src/lib/freshUrl.js.
 *   ① freshUrl: a different URL on every call, keeping any query the URL already has.
 *   ② THE UPLOADER, run against a fake edge on localhost that caches GET and HEAD by full URL and ignores request
 *     cache headers: an object is read (warming the edge), then changed in the bucket, then read again.
 *     probe must not call the changed object fresh (else it is never put back); writeIndex must append to the
 *     CHANGED history (else it forgets manifests a visitor may hold).
 *   ③ THE PLAYER COPY (promote-player-to-prod, the Ward), run against the same edge with `npx` stubbed: a visitor's
 *     page reads staging's Ward pointer (current.json, cached), the Ward republishes a new build, then the town is
 *     promoted. Production must get the NEW build. A plain read pins the edge's copy of the pointer: a self-consistent
 *     older build, exit 0. (The retired legacy player's copy was this leg until 2026-11-01.)
 *   ④ BY SOURCE, every file under scripts/, cartograph/ and scratch/promote-rollback/ (plus the compression gate):
 *     no read leans on fetch's `cache: 'no-store'` or a `?cb=${Date.now()}` bust (both measured to do nothing here,
 *     or to be reused); and in a file that imports freshUrl, every fetch/getStored/fetchRaw reads through it, unless
 *     its URL is a literal https:// address of a host that is not ours, defined beside the call (Nominatim).
 *   ⑤ THE ZONE, live (skipped under --mutants): a fresh query on an object the edge does cache must not be a HIT.
 *     ② to ④ prove the code against a fake edge that keys its cache on the query; this proves the zone still does
 *     (a Cache Rule ignoring the query would make every fresh read the edge's copy again, silently).
 * `--mutants`: each edit below must turn this RED. ⛔ READ-ONLY (temp dirs, a localhost server, and mutant copies
 * beside their originals, removed in `finally`).
 *
 * Usage: node checks/claims-our-reads-bypass-the-edge.mjs [--mutants]
 */
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync, chmodSync, mkdirSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { importSource } from './_importSource.mjs'
import { sourceFile } from './_sourceFile.mjs'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const P = {
  fresh: join(ROOT, 'src/lib/freshUrl.js'),
  upload: join(ROOT, 'scripts/upload-baked-to-r2.mjs'),
  verify: join(ROOT, 'scripts/verify-baked-in-r2.mjs'),
  backup: join(ROOT, 'scratch/promote-rollback/backup-prod-slab.mjs'),
  gate: join(ROOT, 'scratch/slab-compressed-gate.mjs'),
  promote: join(ROOT, 'scripts/promote-player-to-prod.mjs'),
  serve: join(ROOT, 'cartograph/serve.js'),
}
const md5 = (b) => createHash('md5').update(b).digest('hex')
let seq = 0
const load = (p) => import(pathToFileURL(p).href + `?v=${++seq}`)

// What each leg reads: the repo files, or — under a mutant { which, from, to } — that one with its rule changed, in memory
// (checks/_importSource.mjs; a script that must be SPAWNED, as a temp file by checks/_sourceFile.mjs; never beside the
// source). A mutated freshUrl reaches the uploader and the player copy through a redirect of their import of it.
function sources(mut = null) {
  const edit = mut ? (s) => s.replace(mut.from, mut.to) : null, is = (k) => mut?.which === k
  return {
    text: (file) => { const s = readFileSync(file, 'utf8'); return mut && file === P[mut.which] ? edit(s) : s },
    fresh: () => (is('fresh') ? importSource('src/lib/freshUrl.js', { transform: edit }) : load(P.fresh)),
    upload: () => (is('upload') ? importSource('scripts/upload-baked-to-r2.mjs', { transform: edit })
      : is('fresh') ? importSource('scripts/upload-baked-to-r2.mjs', { redirect: { 'src/lib/freshUrl.js': { transform: edit } } })
      : load(P.upload)),
    promote: () => (is('promote') ? sourceFile('scripts/promote-player-to-prod.mjs', { transform: edit })
      : is('fresh') ? sourceFile('scripts/promote-player-to-prod.mjs', { redirect: { 'src/lib/freshUrl.js': { transform: edit } } })
      : P.promote),
  }
}

// ── ① ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legHelper(S, fails) {
  const { freshUrl } = await S.fresh()
  const a = freshUrl('https://h/x.bin'), b = freshUrl('https://h/x.bin')
  if (a === b) fails.push('① freshUrl gave the same URL twice — the second read is the edge\'s copy of the first')
  if (!a.startsWith('https://h/x.bin?')) fails.push(`① freshUrl changed the URL itself: ${a}`)
  if (!freshUrl('https://h/x.bin?k=1').startsWith('https://h/x.bin?k=1&')) fails.push('① freshUrl dropped the URL\'s own query')
}

/** A fake edge over `bucket` (key → Buffer) that caches every answer, GET and HEAD, by its full URL with the query,
 *  and ignores request cache headers — stricter than the zone, which today leaves .json and HEADs uncached. */
async function fakeEdge(bucket) {
  const cache = new Map()
  const server = createServer((req, res) => {
    const key = decodeURIComponent(req.url.slice(1).split('?')[0])
    let hit = cache.get(req.method + ' ' + req.url)
    if (!hit) {
      const b = bucket[key]
      hit = b ? { status: 200, headers: { 'content-length': b.length, etag: `"${md5(b)}"` }, body: b } : { status: 404, headers: {}, body: Buffer.alloc(0) }
      cache.set(req.method + ' ' + req.url, hit)
    }
    res.writeHead(hit.status, hit.headers)
    res.end(req.method === 'HEAD' ? undefined : hit.body)
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  return { base: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() }
}

// ── ② ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legUploader(S, fails) {
  const tmp = mkdtempSync(join(tmpdir(), 'reads-bypass-'))
  const bucket = {}   // key → Buffer: what R2 holds
  const edge = await fakeEdge(bucket), base = edge.base
  const was = process.env.ASSET_BASE
  process.env.ASSET_BASE = base
  try {
    const U = await S.upload()
    const plainRead = async (key) => { await fetch(base + key); await fetch(base + key, { method: 'HEAD' }) }   // a visitor's, warming the edge

    // probe: local bytes unchanged; the bucket's object changed after the edge cached it.
    const v1 = Buffer.from('{"v":1}\n'), local = join(tmp, 'scene.json'); writeFileSync(local, v1)
    const f = { abs: local, rel: 'scene.json', key: 'baked/fx/scene.json', bytes: v1.length, cache: 'x' }
    bucket[f.key] = v1
    await U.probe([f], 1); await plainRead(f.key)
    bucket[f.key] = Buffer.from('{"v":2, "changed": "in the bucket"}\n')
    if ((await U.probe([f], 1)).has(f.key)) fails.push('② probe called an object fresh off the edge\'s copy — the bucket\'s changed object would never be put back')

    // writeIndex: the published history grew after the edge cached it.
    const ix = { abs: join(tmp, 'index.json'), key: 'baked/fx/manifests/index.json', bytes: 0, cache: 'x', index: { town: 'fx', copyKey: 'baked/fx/manifests/cccc.json', writtenAt: null } }
    bucket[ix.key] = Buffer.from(JSON.stringify({ town: 'fx', manifests: [{ key: 'baked/fx/manifests/aaaa.json' }] }))
    await U.writeIndex(ix); await plainRead(ix.key)
    bucket[ix.key] = Buffer.from(JSON.stringify({ town: 'fx', manifests: [{ key: 'baked/fx/manifests/aaaa.json' }, { key: 'baked/fx/manifests/bbbb.json' }] }))
    await U.writeIndex(ix)
    const keys = JSON.parse(readFileSync(ix.abs, 'utf8')).manifests.map((m) => m.key)
    if (!keys.includes('baked/fx/manifests/bbbb.json')) fails.push(`② writeIndex appended to the edge's copy of the history and forgot a manifest (wrote ${keys.join(', ')})`)
  } finally {
    if (was == null) delete process.env.ASSET_BASE; else process.env.ASSET_BASE = was
    edge.close(); rmSync(tmp, { recursive: true, force: true })
  }
}

// ── ③ ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legPlayerCopy(S, fails) {
  const tmp = mkdtempSync(join(tmpdir(), 'reads-bypass-promote-'))
  const bucket = {}
  const edge = await fakeEdge(bucket)
  const sha256 = (b) => createHash('sha256').update(b).digest('hex')
  const KIT = 'c'.repeat(40)
  const kitFiles = { 'k.js': 'export const kit = 1\n' }
  bucket[`staging/kit/${KIT}/k.js`] = Buffer.from(kitFiles['k.js'])
  bucket[`staging/kit/${KIT}/manifest.json`] = Buffer.from(JSON.stringify({ kit: KIT, files: { 'k.js': sha256(Buffer.from(kitFiles['k.js'])) } }))
  bucket['staging/sites/fx/player.json'] = Buffer.from('{"player":"ward"}')
  bucket['staging/sites/fx/towns.json'] = Buffer.from('{"fx":{"title":"Fx","description":null,"icon":null,"iconFrom":"not baked"}}')
  const publish = (v) => {   // what the Ward's publish leaves: a build at its own sha, its list, then the pointer LAST
    const sha = (v === 'v1' ? 'a' : 'b').repeat(40)
    const files = { 'index.html': `<!doctype html><!-- ${v} -->`, 'app.js': `export const build = '${v}'\n` }
    for (const [rel, body] of Object.entries(files)) bucket[`staging/ward/${sha}/${rel}`] = Buffer.from(body)
    bucket[`staging/ward/${sha}/build.json`] = Buffer.from(JSON.stringify({ ward: sha, kit: KIT, builtAt: v, files: Object.fromEntries(Object.entries(files).map(([rel, body]) => [rel, sha256(Buffer.from(body))])) }))
    bucket['staging/ward/current.json'] = Buffer.from(JSON.stringify({ sha, kit: KIT }))
    return sha
  }
  publish('v1')
  for (const k of ['staging/ward/current.json', 'staging/sites/fx/player.json']) await fetch(edge.base + k)   // a visitor's page asks the pointer: the edge caches it
  const s2 = publish('v2')
  const bin = join(tmp, 'bin'), puts = join(tmp, 'puts')
  mkdirSync(bin); mkdirSync(puts)
  writeFileSync(join(bin, 'npx'), `#!/bin/sh\nk=$(printf %s "$5" | tr / _)\ncat > "${puts}/$k"\n`)
  chmodSync(join(bin, 'npx'), 0o755)
  try {
    const code = await new Promise((ok) => {
      const p = spawn(process.execPath, [S.promote(), '--map=fx', '--look=fx'], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ASSET_BASE: edge.base, R2_BUCKET: 'b' }, stdio: 'ignore' })
      p.on('close', ok)
    })
    const got = join(puts, `b_ward_${s2}_app.js`)
    if (code !== 0) fails.push(`③ promote-player-to-prod exited ${code} on a republished Ward (it read the edge's copy and refused)`)
    else if (!existsSync(got) || readFileSync(got, 'utf8') !== "export const build = 'v2'\n") {
      fails.push(`③ promote-player-to-prod did not pin the republished Ward build ${s2.slice(0, 8)} (it read the edge's copy of staging/ward/current.json) — the old build, into a live town`)
    }
  } finally { edge.close(); rmSync(tmp, { recursive: true, force: true }) }
}

// ── ④ ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const SOURCE_ROOTS = ['scripts', 'cartograph', 'scratch/promote-rollback']
const OURS = /theward|\.online\b|lafayette-square\.com|127\.0\.0\.1|localhost/
function sourceFiles() {
  const out = new Set([P.gate, P.verify, P.backup, P.promote, P.serve])
  const walk = (d) => { for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === 'data' || n === '_archive' || n.startsWith('.')) continue
    const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(mjs|js)$/.test(n)) out.add(p)
  } }
  for (const r of SOURCE_ROOTS) walk(join(ROOT, r))
  // a mutant stands in for its original: S.text reads its edited text at the original's path
  return [...out]
}
function legSource(S, fails) {
  let importers = 0
  for (const file of sourceFiles()) {
    const src = S.text(file), at = file.slice(ROOT.length)
    const code = src.replace(/^\s*(\/\/|\*).*$/gm, '')
    if (/cache:\s*'no-store'/.test(code)) fails.push(`④ ${at}: a read leans on fetch's cache: 'no-store', which the edge ignores — freshUrl`)
    if (/[?&]\w+=\$\{Date\.now\(\)\}/.test(code)) fails.push(`④ ${at}: a read busts the edge with Date.now(), which two reads in one millisecond reuse — freshUrl`)
    if (!/import \{ freshUrl \} from '(\.\.\/)+src\/lib\/freshUrl\.js'/.test(src)) continue
    importers++
    const lines = code.split('\n')
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/(?<![\w.])(fetch|getStored|fetchRaw)\(\s*([^\n]{0,24})/g)) {
        const [, fn, arg] = m
        if (arg.startsWith('freshUrl(') || /^(url|u), ae\)|^url, enc\)/.test(arg) && /=>\s*new Promise/.test(line)) continue
        const id = (arg.match(/^([A-Za-z_]\w*)\s*[,)]/) || [])[1]
        const def = id && lines.slice(Math.max(0, i - 3), i).reverse().map((l) => l.match(new RegExp(`const ${id} = \`https://([^/\`$]+)`))).find(Boolean)
        if (def && !OURS.test(def[1])) continue   // an external service's address, literal and beside the call
        fails.push(`④ ${at}:${i + 1}: ${fn}(${arg}…) reads without freshUrl — the edge's copy`)
      }
    })
  }
  if (importers < 5) fails.push(`④ only ${importers} file(s) import freshUrl — re-aim this check`)
}

// ── ⑤ ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legZone(fails) {
  const { freshUrl } = await load(P.fresh)
  const host = 'https://assets.theward.online/'
  const m = await fetch(freshUrl(`${host}staging/player/manifest.json`))
  if (!m.ok) return fails.push(`⑤ staging/player/manifest.json answered ${m.status} — no object to probe the zone with`)
  const rel = (await m.json()).files.map((f) => f.rel).find((r) => r.endsWith('.js'))
  const url = `${host}staging/player/${rel}`, status = async (u) => (await fetch(u)).headers.get('cf-cache-status')
  const once = freshUrl(url)
  await status(once)
  if (await status(once) !== 'HIT') return fails.push(`⑤ ${rel} is not cached even when read twice — no cached object to probe the zone with; re-aim`)
  const fresh = await status(freshUrl(url))
  if (fresh === 'HIT') fails.push(`⑤ the zone answered a fresh query with a HIT on ${rel}: it no longer keys its cache on the query (a Cache Rule?), so every freshUrl read is the edge's copy`)
  else console.log(`   ⑤ the zone: ${rel} cached (HIT on a repeated query), a fresh query ${fresh}`)
}

async function run(S) {
  const fails = []
  await legHelper(S, fails); await legUploader(S, fails); await legPlayerCopy(S, fails); legSource(S, fails)
  return fails
}

// ── mutants: each one rule changed, in memory (sources(mut)); nothing is written beside a source ────────────────────
const MUTANTS = [
  ['freshUrl returns the URL unchanged', 'fresh', "export const freshUrl = (url) => `${url}${url.includes('?') ? '&' : '?'}fresh=${crypto.randomUUID()}`", 'export const freshUrl = (url) => url'],
  ['freshUrl a fixed query (fresh once, the edge\'s copy after)', 'fresh', 'fresh=${crypto.randomUUID()}', 'fresh=1'],
  ['probe reads the plain URL', 'upload', 'fetch(freshUrl(PUBLIC_BASE + f.key), {', 'fetch(PUBLIC_BASE + f.key, {'],
  ['writeIndex reads the plain URL with no-store', 'upload', 'const r = await fetch(freshUrl(PUBLIC_BASE + f.key))', "const r = await fetch(PUBLIC_BASE + f.key, { cache: 'no-store' })"],
  ['verify reads the plain URL', 'verify', 'fetch(freshUrl(BASE + f.key), {', 'fetch(BASE + f.key, {'],
  ['the backup reads the plain URL', 'backup', "getStored(freshUrl(base + rel.split('/').map(encodeURIComponent).join('/')), want)", "getStored(base + rel.split('/').map(encodeURIComponent).join('/'), want)"],
  ['the gate reads the manifest plain', 'gate', 'fetchRaw(freshUrl(`${at}manifest.json`), ', 'fetchRaw(`${at}manifest.json`, '],
  ['the gate reads a file plain', 'gate', 'fetchRaw(freshUrl(url), ae)', 'fetchRaw(url, ae)'],
  ['the player copy reads plain with no-store', 'promote', 'r = await fetch(freshUrl(PUBLIC_BASE + key))', "r = await fetch(PUBLIC_BASE + key, { cache: 'no-store' })"],
  ['the player copy reads plain', 'promote', 'r = await fetch(freshUrl(PUBLIC_BASE + key))', 'r = await fetch(PUBLIC_BASE + key)'],
  ['Operations reads a served manifest with a Date.now() bust', 'serve', 'fetch(freshUrl(`${base}${manifestPath(look)}`))', 'fetch(`${base}${manifestPath(look)}?cb=${Date.now()}`)'],
  ['Operations reads the production page plain', 'serve', 'fetch(freshUrl(`https://${domain}/`))', 'fetch(`https://${domain}/`)'],
]

const fails = await run(sources())
if (!process.argv.includes('--mutants')) await legZone(fails)
if (fails.length) { console.error(`⛔ a read of the bucket can get the edge's copy:\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log('✅ our reads bypass the edge: freshUrl is new every call; probe, writeIndex and the player copy see a changed object; every read of ours goes through it')

if (process.argv.includes('--mutants')) {
  let alive = 0
  // ⛔ the controls: a no-op edit through each in-memory path must read GREEN, else every mutant's "RED" is the loader's
  for (const which of ['fresh', 'upload', 'promote']) {
    const f = await run(sources({ which, from: '\u0000no such text', to: '' }))
    if (f.length) { console.error(`⛔ the in-memory ${which} fails unmutated — the mutants prove nothing:\n   ${f.join('\n   ')}`); process.exit(1) }
  }
  for (const [name, which, from, to] of MUTANTS) {
    const src = readFileSync(P[which], 'utf8')
    if (!src.includes(from)) { console.error(`⛔ mutant "${name}": its target text is gone from ${P[which]} — re-aim it`); alive++; continue }
    let red, threw = ''
    try { red = (await run(sources({ which, from, to }))).length > 0 } catch (e) { red = true; threw = ` (by throwing: ${e.message.slice(0, 80)})` }   // as its crashed copy was
    console.log(`   ${red ? 'RED  ' : 'ALIVE'} ${name}${threw}`)
    if (!red) alive++
  }
  if (alive) { console.error(`⛔ ${alive} mutant(s) survived — the check cannot see that edit`); process.exit(1) }
  console.log(`✅ all ${MUTANTS.length} mutants RED`)
}
