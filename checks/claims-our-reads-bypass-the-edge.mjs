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
 *   ③ THE READERS THAT ARE CLIs (verify-baked-in-r2, the prod-slab backup, the compression gate), by source: each
 *     imports freshUrl, and every read call in it — fetch, getStored, fetchRaw — has freshUrl(…) as its URL.
 * `--mutants`: each edit below must turn this RED. ⛔ READ-ONLY (temp dirs, a localhost server, and mutant copies
 * beside their originals, removed in `finally`).
 *
 * Usage: node checks/claims-our-reads-bypass-the-edge.mjs [--mutants]
 */
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
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
}
const CLI_READERS = ['verify', 'backup', 'gate']
const md5 = (b) => createHash('md5').update(b).digest('hex')
let seq = 0
const load = (p) => import(pathToFileURL(p).href + `?v=${++seq}`)

// ── ① ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legHelper(paths, fails) {
  const { freshUrl } = await load(paths.fresh)
  const a = freshUrl('https://h/x.bin'), b = freshUrl('https://h/x.bin')
  if (a === b) fails.push('① freshUrl gave the same URL twice — the second read is the edge\'s copy of the first')
  if (!a.startsWith('https://h/x.bin?')) fails.push(`① freshUrl changed the URL itself: ${a}`)
  if (!freshUrl('https://h/x.bin?k=1').startsWith('https://h/x.bin?k=1&')) fails.push('① freshUrl dropped the URL\'s own query')
}

// ── ② ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legUploader(paths, fails) {
  const tmp = mkdtempSync(join(tmpdir(), 'reads-bypass-'))
  const bucket = {}   // key → Buffer: what R2 holds
  const cache = new Map()   // full URL (with query) → the answer the edge stored
  const server = createServer((req, res) => {
    const key = decodeURIComponent(req.url.slice(1).split('?')[0])
    let hit = cache.get(req.method + ' ' + req.url)
    if (!hit) {
      const b = bucket[key]
      hit = b ? { status: 200, headers: { 'content-length': b.length, etag: `"${md5(b)}"`, 'content-type': 'application/json' }, body: b } : { status: 404, headers: {}, body: Buffer.alloc(0) }
      cache.set(req.method + ' ' + req.url, hit)
    }
    res.writeHead(hit.status, hit.headers)
    res.end(req.method === 'HEAD' ? undefined : hit.body)
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}/`
  const was = process.env.ASSET_BASE
  process.env.ASSET_BASE = base
  try {
    const U = await load(paths.upload)
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
    server.close(); rmSync(tmp, { recursive: true, force: true })
  }
}

// ── ③ ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function legSource(paths, fails) {
  for (const which of CLI_READERS) {
    const src = readFileSync(paths[which], 'utf8'), at = paths[which].slice(ROOT.length)
    if (!/import \{ freshUrl \} from '(\.\.\/)+src\/lib\/freshUrl\.js'/.test(src)) fails.push(`③ ${at} does not import freshUrl`)
    const calls = [...src.matchAll(/(?<![\w.])(fetch|getStored|fetchRaw)\(\s*([^\n]{0,24})/g)]
    if (!calls.length) fails.push(`③ ${at}: no read call found — re-aim this check`)
    for (const [, fn, arg] of calls) if (!arg.startsWith('freshUrl(')) fails.push(`③ ${at}: ${fn}(${arg}…) reads without freshUrl — the edge's copy`)
  }
}

async function run(paths) {
  const fails = []
  await legHelper(paths, fails); await legUploader(paths, fails); legSource(paths, fails)
  return fails
}

// ── mutants: each a copy beside its original, the paths pointed at it ──────────────────────────────────────────
const MUTANTS = [
  ['freshUrl returns the URL unchanged', 'fresh', "export const freshUrl = (url) => `${url}${url.includes('?') ? '&' : '?'}fresh=${crypto.randomUUID()}`", 'export const freshUrl = (url) => url'],
  ['freshUrl a fixed query (fresh once, the edge\'s copy after)', 'fresh', 'fresh=${crypto.randomUUID()}', 'fresh=1'],
  ['probe reads the plain URL', 'upload', 'fetch(freshUrl(PUBLIC_BASE + f.key), {', 'fetch(PUBLIC_BASE + f.key, {'],
  ['writeIndex reads the plain URL with no-store', 'upload', 'const r = await fetch(freshUrl(PUBLIC_BASE + f.key))', "const r = await fetch(PUBLIC_BASE + f.key, { cache: 'no-store' })"],
  ['verify reads the plain URL', 'verify', 'fetch(freshUrl(BASE + f.key), {', 'fetch(BASE + f.key, {'],
  ['the backup reads the plain URL', 'backup', "getStored(freshUrl(base + rel.split('/').map(encodeURIComponent).join('/')), want)", "getStored(base + rel.split('/').map(encodeURIComponent).join('/'), want)"],
  ['the gate reads the manifest plain', 'gate', 'fetchRaw(freshUrl(`${at}manifest.json`), ', 'fetchRaw(`${at}manifest.json`, '],
  ['the gate reads a file plain', 'gate', 'fetchRaw(freshUrl(url), ae)', 'fetchRaw(url, ae)'],
]

const fails = await run(P)
if (fails.length) { console.error(`⛔ a read of the bucket can get the edge's copy:\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log('✅ our reads bypass the edge: freshUrl is new every call; probe and writeIndex see a changed object; verify, backup and the gate read through it')

if (process.argv.includes('--mutants')) {
  let alive = 0
  for (const [name, which, from, to] of MUTANTS) {
    const src = readFileSync(P[which], 'utf8')
    if (!src.includes(from)) { console.error(`⛔ mutant "${name}": its target text is gone from ${P[which]} — re-aim it`); alive++; continue }
    const copy = join(dirname(P[which]), `.mutant-${basename(P[which])}`)
    writeFileSync(copy, src.replace(from, to))
    const paths = { ...P, [which]: copy }, extra = []
    let red
    try {
      if (which === 'fresh') {   // the uploader must reach the mutant helper (a query per mutant: one path, one module, else)
        const d = join(dirname(P.upload), `.mutant-${basename(P.upload)}`)
        writeFileSync(d, readFileSync(P.upload, 'utf8').replace("from '../src/lib/freshUrl.js'", `from '../src/lib/.mutant-freshUrl.js?m=${++seq}'`)); paths.upload = d; extra.push(d)
      }
      red = (await run(paths)).length > 0
    } finally { for (const d of [copy, ...extra]) rmSync(d, { force: true }) }
    console.log(`   ${red ? 'RED  ' : 'ALIVE'} ${name}`)
    if (!red) alive++
  }
  if (alive) { console.error(`⛔ ${alive} mutant(s) survived — the check cannot see that edit`); process.exit(1) }
  console.log(`✅ all ${MUTANTS.length} mutants RED`)
}
