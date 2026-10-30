#!/usr/bin/env node
/**
 * "IS A SLAB BINARY STORED AND SERVED COMPRESSED — AND DOES EVERYTHING THAT READS IT BACK READ THE STORED BYTES?"
 *
 * WHY (BRIEF-the-slab-ships-compressed, 2026-10-30). Every slab .bin went out as application/octet-stream, which the
 * edge does not compress: PTown's six were 85.86 MB on the wire, 29.96 MB at brotli-5. The fix stores a type nothing
 * else compresses brotli-encoded in R2 (src/lib/slabWire.js), and that changes what R2's ETag and length mean. So
 * this runs the code, against fixtures, with no network and no R2:
 *   ① THE RULE (src/lib/slabWire.js): .bin and .glb are stored br; a type the edge compresses (json) or a packed
 *     format (ktx2, png, jpg) is stored raw; an unknown extension is octet-stream, stored br. wireHeaders says
 *     nothing about encoding for an object stored without one.
 *   ② THE UPLOADER (upload-baked-to-r2.mjs#put, #probe), with `npx` stubbed on PATH and a fake edge on localhost:
 *     put writes a .bin's BROTLI bytes (equal to slab-wire.mjs#encodeBytes) with --content-encoding br and its type,
 *     and a .json raw with no encoding; probe, against an edge that answers as the one-object trial measured (br
 *     asked → stored length + strong ETag; anything else → decoded, weak ETag, no length), finds every unchanged
 *     object fresh.
 *   ③ THE WORKERS: production-sites' fetch with a mock R2 — a stored-br .bin goes out with content-encoding br, the
 *     STORED length, no accept-ranges and `encodeBody: 'manual'` (the trial: without it the runtime encodes the
 *     brotli a second time); a Range request for it is a 416 BEFORE the get; a raw object keeps accept-ranges and
 *     says nothing about encoding. staging-sites' serve does the same for a stored-br object.
 *   ④ THE READERS THAT CAN'T BE RUN HERE read the rule's read-back encoding by source: verify-baked-in-r2.mjs and
 *     scratch/promote-rollback/backup-prod-slab.mjs.
 * `--mutants`: each edit below must turn this RED. ⛔ READ-ONLY (temp dirs, and mutant copies beside their originals,
 * removed in `finally`).
 *
 * Usage: node checks/claims-the-slab-ships-compressed.mjs [--mutants]
 */
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const P = {
  wire: join(ROOT, 'src/lib/slabWire.js'),
  upload: join(ROOT, 'scripts/upload-baked-to-r2.mjs'),
  prod: join(ROOT, 'workers/production-sites/src/index.js'),
  staging: join(ROOT, 'workers/staging-sites/src/index.js'),
  verify: join(ROOT, 'scripts/verify-baked-in-r2.mjs'),
  backup: join(ROOT, 'scratch/promote-rollback/backup-prod-slab.mjs'),
}
const md5 = (b) => createHash('md5').update(b).digest('hex')
let seq = 0
const load = (p) => import(pathToFileURL(p).href + `?v=${++seq}`)

// ── ① the rule ──────────────────────────────────────────────────────────────────────────────────────────────
async function legRule(paths, fails) {
  const W = await load(paths.wire)
  const want = { 'ground.bin': 'br', 'trees/oak/a-lod1.glb': 'br', 'scene.json': null, 'trees/oak/a.albedo.ktx2': null,
    'trees-atlas-color.png': null, 'content/photos/a/01.jpg': null, 'odd.dat': 'br' }
  for (const [f, enc] of Object.entries(want)) if (W.storedEncodingFor(f) !== enc) fails.push(`① ${f} is stored ${W.storedEncodingFor(f) ?? 'raw'}, want ${enc ?? 'raw'}`)
  if (W.typeFor('ground.bin') !== 'application/octet-stream') fails.push(`① ground.bin's type is ${W.typeFor('ground.bin')}`)
  if (W.readBackEncoding('ground.bin') !== 'br' || W.readBackEncoding('scene.json') !== 'identity') fails.push('① readBackEncoding: br for a stored-br file, identity for a raw one')
  const h = W.wireHeaders({ key: 'x.bin', httpMetadata: {} })
  if ('content-encoding' in h) fails.push('① wireHeaders names an encoding for an object stored without one')
  if (W.wireHeaders({ key: 'x.bin', httpMetadata: { contentEncoding: 'br' } })['content-encoding'] !== 'br') fails.push('① wireHeaders drops a stored br')
}

// ── ② the uploader ──────────────────────────────────────────────────────────────────────────────────────────
async function legUpload(paths, fails) {
  const tmp = mkdtempSync(join(tmpdir(), 'slab-wire-check-'))
  const { encodeBytes } = await load(join(ROOT, 'scripts/slab-wire.mjs'))
  // A compressible "bin" (a smooth float field, like terrain) and a json.
  const f32 = new Float32Array(200000); for (let i = 0; i < f32.length; i++) f32[i] = Math.sin(i / 300) * 12.5
  const raw = { 'baked/fx/ground.bin': Buffer.from(f32.buffer), 'baked/fx/scene.json': Buffer.from(JSON.stringify({ look: 'fx', pad: randomBytes(64).toString('hex') })) }
  const files = Object.entries(raw).map(([key, b]) => { const abs = join(tmp, basename(key)); writeFileSync(abs, b); return { abs, rel: basename(key), key, bytes: b.length, cache: 'x' } })
  const stored = Object.fromEntries(await Promise.all(Object.entries(raw).map(async ([k, b]) => [k, k.endsWith('.bin') ? { body: await encodeBytes(b), enc: 'br' } : { body: b, enc: null }])))

  // The fake edge: answers as the one-object trial measured on assets.theward.online.
  const server = createServer((req, res) => {
    const key = decodeURIComponent(req.url.slice(1).split('?')[0]), s = stored[key]
    if (!s) { res.writeHead(404); return res.end() }
    const ae = String(req.headers['accept-encoding'] || '')
    if (s.enc ? ae.includes(s.enc) : ae === 'identity') {
      res.writeHead(200, { 'content-length': s.body.length, etag: `"${md5(s.body)}"`, ...(s.enc ? { 'content-encoding': s.enc } : {}) })
    } else {
      res.writeHead(200, { etag: `W/"${md5(s.body)}"`, 'transfer-encoding': 'chunked' })   // transformed: no length, weak
    }
    res.end()
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  // A stub `npx` that records its arguments and keeps a copy of the --file it was handed.
  const bin = join(tmp, 'bin'); rmSync(bin, { recursive: true, force: true })
  await import('node:fs').then((fs) => fs.mkdirSync(bin))
  writeFileSync(join(bin, 'npx'), `#!/bin/sh\nn=$(ls "${tmp}"/put-*.args 2>/dev/null | wc -l | tr -d ' ')\nprintf '%s\\n' "$@" > "${tmp}/put-$n.args"\nwhile [ $# -gt 0 ]; do [ "$1" = --file ] && cp "$2" "${tmp}/put-$n.body"; shift; done\n`)
  chmodSync(join(bin, 'npx'), 0o755)
  const was = { PATH: process.env.PATH, ASSET_BASE: process.env.ASSET_BASE }
  process.env.PATH = `${bin}:${process.env.PATH}`; process.env.ASSET_BASE = `http://127.0.0.1:${server.address().port}/`
  try {
    const U = await load(paths.upload)
    for (const f of files) await U.put(f)
    for (let n = 0; n < files.length; n++) {
      const args = readFileSync(join(tmp, `put-${n}.args`), 'utf8').trim().split('\n'), key = args[4].split('/').slice(1).join('/')
      const body = readFileSync(join(tmp, `put-${n}.body`)), s = stored[key], at = (k) => args[args.indexOf(k) + 1]
      if (!body.equals(s.body)) fails.push(`② put wrote ${key} as ${body.length} B, want its ${s.enc ?? 'raw'} bytes (${s.body.length} B)`)
      if (s.enc && at('--content-encoding') !== s.enc) fails.push(`② put stored ${key} with no --content-encoding ${s.enc}`)
      if (!s.enc && args.includes('--content-encoding')) fails.push(`② put stored raw ${key} with a content-encoding`)
      if (key.endsWith('.bin') && at('--content-type') !== 'application/octet-stream') fails.push(`② put typed ${key} ${at('--content-type')}`)
    }
    const fresh = await U.probe(files, 2)
    for (const f of files) if (!fresh.has(f.key)) fails.push(`② probe did not find unchanged ${f.key} fresh (it would re-upload on every pour)`)
  } finally {
    process.env.PATH = was.PATH; if (was.ASSET_BASE == null) delete process.env.ASSET_BASE; else process.env.ASSET_BASE = was.ASSET_BASE
    server.close(); rmSync(tmp, { recursive: true, force: true })
  }
}

// ── ③ the Workers ───────────────────────────────────────────────────────────────────────────────────────────
async function legWorkers(paths, fails) {
  const NativeResponse = globalThis.Response, inits = []
  globalThis.Response = class extends NativeResponse { constructor(body, init) { super(body, init); inits.push(init || {}) } }
  try {
    const enc = { key: 'baked/demo/ground.0123456789abcdef.bin', size: 7, httpEtag: '"e"', body: new Uint8Array(7), httpMetadata: { contentType: 'application/octet-stream', contentEncoding: 'br' } }
    const raw = { key: 'baked/demo/scene.0123456789abcdef.json', size: 5, httpEtag: '"r"', body: new Uint8Array(5), httpMetadata: { contentType: 'application/json; charset=utf-8' } }
    const R2 = { 'hosts/demo.online.json': { json: async () => ({ v: 2, app: 'legacy', map: 'demo', look: 'demo' }) }, [enc.key]: enc, [raw.key]: raw }
    const gets = []
    const env = { ASSETS: { get: async (k, o) => { gets.push({ k, range: !!o?.range }); return R2[k] ?? null }, head: async (k) => R2[k] ?? null } }
    const W = (await load(paths.prod)).default
    const call = async (key, headers = {}) => { inits.length = 0; const r = await W.fetch(new Request(`https://demo.online/${key}`, { headers }), env); return { r, init: inits.at(-1) } }

    let { r, init } = await call(enc.key)
    if (r.headers.get('content-encoding') !== 'br') fails.push(`③ production sends a stored-br .bin with content-encoding ${r.headers.get('content-encoding')}`)
    if (r.headers.get('content-length') !== String(enc.size)) fails.push(`③ production's content-length ${r.headers.get('content-length')}, want the stored ${enc.size}`)
    if (r.headers.has('accept-ranges')) fails.push('③ production offers byte ranges of an encoded object')
    if (init?.encodeBody !== 'manual') fails.push(`③ production returns an encoded body with encodeBody ${JSON.stringify(init?.encodeBody)} — the runtime encodes it twice (trial, 2026-10-30)`)
    gets.length = 0
    ;({ r } = await call(enc.key, { range: 'bytes=0-3' }))
    if (r.status !== 416) fails.push(`③ a Range request for an encoded object got ${r.status}, want 416`)
    if (gets.some((g) => g.k === enc.key)) fails.push('③ production asked R2 for a range of an encoded object (a slice of its brotli stream)')
    ;({ r, init } = await call(raw.key))
    if (r.headers.has('content-encoding')) fails.push('③ production names an encoding for a raw object')
    if (r.headers.get('accept-ranges') !== 'bytes') fails.push('③ production stopped offering ranges of a raw object')

    const S = (await load(paths.staging)).default
    const senv = { SLAB_BASE: 'https://assets.theward.online/staging/', PLAYER_PREFIX: 'staging/player/',
      ASSETS: { get: async (k) => (k === 'staging/player/x.bin' ? { ...enc, key: k } : null), head: async () => null } }
    inits.length = 0
    const sr = await S.fetch(new Request('https://staging.theward.online/_player/x.bin'), senv)
    if (sr.headers.get('content-encoding') !== 'br' || inits.at(-1)?.encodeBody !== 'manual') fails.push(`③ staging-sites sends a stored-br object with content-encoding ${sr.headers.get('content-encoding')}, encodeBody ${JSON.stringify(inits.at(-1)?.encodeBody)}`)
  } finally { globalThis.Response = NativeResponse }
}

// ── ④ by source ─────────────────────────────────────────────────────────────────────────────────────────────
function legSource(paths, fails) {
  const v = readFileSync(paths.verify, 'utf8')
  if (!/'accept-encoding': readBackEncoding\(f\.key\)/.test(v)) fails.push('④ verify-baked-in-r2 does not HEAD with slabWire#readBackEncoding')
  if (!/\(await wireOf\(f\.abs, f\.key\)\)\.bytes/.test(v)) fails.push('④ verify-baked-in-r2 does not compare the STORED length (slab-wire.mjs#wireOf)')
  const b = readFileSync(paths.backup, 'utf8')
  if (!/getStored\([^)]*readBackEncoding|const want = readBackEncoding\(rel\)/.test(b) || !/strong !== md5\(r\.body\)/.test(b)) fails.push('④ backup-prod-slab does not compare the stored bytes to a strong etag')
}

async function run(paths) {
  const fails = []
  await legRule(paths, fails); await legUpload(paths, fails); await legWorkers(paths, fails); legSource(paths, fails)
  return fails
}

// ── mutants: each a copy beside its original (so its relative imports resolve), the paths pointed at it ────────
const MUTANTS = [
  ['.bin stored raw (the octet-stream path restored)', 'wire', "bin: ['application/octet-stream', BR]", "bin: ['application/octet-stream', PACKED]"],
  ['put drops --content-encoding', 'upload', "...(wire.encoding ? ['--content-encoding', wire.encoding] : []),", ''],
  ['put writes the raw file', 'upload', "'--file', wire.abs,", "'--file', abs,"],
  ['probe reads back with identity', 'upload', "headers: { 'accept-encoding': readBackEncoding(f.key) }", "headers: { 'accept-encoding': 'identity' }"],
  ['probe compares the raw bytes', 'upload', 'etag === wire.md5', 'etag === md5raw(f.abs)'],
  ['production drops encodeBody manual', 'prod', "encoded ? { headers, encodeBody: 'manual' } : { headers }", '{ headers }'],
  ['production asks R2 for a range of an encoded object', 'prod', "      if (request.headers.has('range')) {\n        const h", "      if (false) {\n        const h"],
  ['production drops the stored encoding', 'prod', '    ...wire,\n    \'cache-control\': cacheFor(key', "    'content-type': wire['content-type'],\n    'cache-control': cacheFor(key"],
  ['staging drops encodeBody manual', 'staging', "'content-encoding' in wire ? { headers, encodeBody: 'manual' } : { headers }", '{ headers }'],
  ['verify reads back with identity', 'verify', "'accept-encoding': readBackEncoding(f.key)", "'accept-encoding': 'identity'"],
]

const fails = await run(P)
if (fails.length) { console.error(`⛔ the slab does not ship compressed:\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log('✅ the slab ships compressed: .bin/.glb stored br and put that way, read back as stored, served with encodeBody manual and no ranges')

if (process.argv.includes('--mutants')) {
  let alive = 0
  for (const [name, which, from, to] of MUTANTS) {
    const src = readFileSync(P[which], 'utf8')
    if (!src.includes(from)) { console.error(`⛔ mutant "${name}": its target text is gone from ${P[which]} — re-aim it`); alive++; continue }
    let body = src.replace(from, to)
    if (name === 'probe compares the raw bytes') body = body.replace('export async function probe', "const md5raw = (a) => createHash('md5').update(readFileSync(a)).digest('hex')\nexport async function probe")
    const copy = join(dirname(P[which]), `.mutant-${basename(P[which])}`)
    writeFileSync(copy, body)
    let red
    try {
      // A dependent whose import must reach the mutant copy is copied too, its import rewritten (the rule is imported).
      const paths = { ...P, [which]: copy }, extra = []
      if (which === 'wire') {
        for (const dep of ['upload', 'prod', 'staging']) {
          const d = join(dirname(P[dep]), `.mutant-${basename(P[dep])}`)
          writeFileSync(d, readFileSync(P[dep], 'utf8').replace(/(['"])([./]*src\/lib\/)slabWire\.js\1/, `$1$2.mutant-slabWire.js$1`)); paths[dep] = d; extra.push(d)
        }
      }
      try { red = (await run(paths)).length > 0 } finally { for (const d of extra) rmSync(d, { force: true }) }
    } finally { rmSync(copy, { force: true }) }
    console.log(`   ${red ? 'RED  ' : 'ALIVE'} ${name}`)
    if (!red) alive++
  }
  if (alive) { console.error(`⛔ ${alive} mutant(s) survived — the check cannot see that edit`); process.exit(1) }
  console.log(`✅ all ${MUTANTS.length} mutants RED`)
}
