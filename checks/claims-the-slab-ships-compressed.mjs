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
 *   ②a THE STORED BYTES (slab-wire.mjs#wireOf): three same-basename files encoded at once each point at their own
 *     brotli (a temp name taken after the encode once put one tree's bytes under another's key).
 *   ② THE UPLOADER (upload-baked-to-r2.mjs#put, #probe), with `npx` stubbed on PATH and a fake edge on localhost:
 *     put writes a .bin's BROTLI bytes (equal to slab-wire.mjs#encodeBytes) with --content-encoding br and its type,
 *     and a .json raw with no encoding; probe, against an edge that answers as the one-object trial measured (br
 *     asked → stored length + strong ETag; anything else → decoded, weak ETag, no length), finds every unchanged
 *     object fresh. ②b a file that does not exist at probe and is written (then rewritten) before put — the
     manifests/index.json writeIndex makes at upload time, and a stored-br file — goes up as its CURRENT bytes.
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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { importSource } from './_importSource.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const P = {
  wire: join(ROOT, 'src/lib/slabWire.js'),
  slabWireNode: join(ROOT, 'scripts/slab-wire.mjs'),
  upload: join(ROOT, 'scripts/upload-baked-to-r2.mjs'),
  prod: join(ROOT, 'workers/production-sites/src/index.js'),
  staging: join(ROOT, 'workers/staging-sites/src/index.js'),
  verify: join(ROOT, 'scripts/verify-baked-in-r2.mjs'),
  backup: join(ROOT, 'scratch/promote-rollback/backup-prod-slab.mjs'),
}
const md5 = (b) => createHash('md5').update(b).digest('hex')
let seq = 0
const load = (p) => import(pathToFileURL(p).href + `?v=${++seq}`)

// What each leg reads: the repo files, or — under a mutant { which, edit } — that one with its rule changed, in memory
// (checks/_importSource.mjs; never a copy beside the source). A dependent reaches the mutated module through a redirect of
// its import of it. Each load is a fresh module (a trailing comment per load), as the copies' ?m= queries were.
function sources(mut = null) {
  const is = (k) => mut?.which === k, edit = mut ? (s) => `${mut.edit(s)}\n// mutant load ${++seq}\n` : null
  return {
    text: (k) => { const s = readFileSync(P[k], 'utf8'); return is(k) ? mut.edit(s) : s },
    wire: () => (is('wire') ? importSource('src/lib/slabWire.js', { transform: edit }) : load(P.wire)),
    slabWireNode: () => (is('slabWireNode') ? importSource('scripts/slab-wire.mjs', { transform: edit }) : load(P.slabWireNode)),
    upload: () => (is('upload') ? importSource('scripts/upload-baked-to-r2.mjs', { transform: edit })
      : is('wire') ? importSource('scripts/upload-baked-to-r2.mjs', { redirect: { 'src/lib/slabWire.js': { transform: edit } } })
      : is('slabWireNode') ? importSource('scripts/upload-baked-to-r2.mjs', { redirect: { 'scripts/slab-wire.mjs': { transform: edit } } })
      : load(P.upload)),
    prod: () => (is('prod') ? importSource('workers/production-sites/src/index.js', { transform: edit })
      : is('wire') ? importSource('workers/production-sites/src/index.js', { redirect: { 'src/lib/slabWire.js': { transform: edit } } })
      : load(P.prod)),
    staging: () => (is('staging') ? importSource('workers/staging-sites/src/index.js', { transform: edit })
      : is('wire') ? importSource('workers/staging-sites/src/index.js', { redirect: { 'src/lib/slabWire.js': { transform: edit } } })
      : load(P.staging)),
  }
}

// ── ① the rule ──────────────────────────────────────────────────────────────────────────────────────────────
async function legRule(S, fails) {
  const W = await S.wire()
  const want = { 'ground.bin': 'br', 'trees/oak/a-lod1.glb': 'br', 'scene.json': null, 'trees/oak/a.albedo.ktx2': null,
    'trees-atlas-color.png': null, 'content/photos/a/01.jpg': null, 'odd.dat': 'br' }
  for (const [f, enc] of Object.entries(want)) if (W.storedEncodingFor(f) !== enc) fails.push(`① ${f} is stored ${W.storedEncodingFor(f) ?? 'raw'}, want ${enc ?? 'raw'}`)
  if (W.typeFor('ground.bin') !== 'application/octet-stream') fails.push(`① ground.bin's type is ${W.typeFor('ground.bin')}`)
  if (W.readBackEncoding('ground.bin') !== 'br' || W.readBackEncoding('scene.json') !== 'identity') fails.push('① readBackEncoding: br for a stored-br file, identity for a raw one')
  const h = W.wireHeaders({ key: 'x.bin', httpMetadata: {} })
  if ('content-encoding' in h) fails.push('① wireHeaders names an encoding for an object stored without one')
  if (W.wireHeaders({ key: 'x.bin', httpMetadata: { contentEncoding: 'br' } })['content-encoding'] !== 'br') fails.push('① wireHeaders drops a stored br')
}

// ── ②a the stored bytes: two same-basename files through wireOf at once each get their OWN bytes (Zob's race) ───
async function legWireRace(S, fails) {
  const tmp = mkdtempSync(join(tmpdir(), 'slab-wire-race-'))
  try {
    const { wireOf } = await S.slabWireNode()
    const abs = ['a', 'b', 'c'].map((d) => { const p = join(tmp, d, 'skeleton-1-lod0.glb'); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, randomBytes(4096 + d.charCodeAt(0))); return p })
    const ws = await Promise.all(abs.map((p, i) => wireOf(p, `baked/fx/trees/${'abc'[i]}/skeleton-1-lod0.glb`)))
    ws.forEach((w, i) => { if (md5(readFileSync(w.abs)) !== w.md5) fails.push(`②a wireOf("${abs[i]}") points at another file's bytes (${w.abs})`) })
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

// ── ② the uploader ──────────────────────────────────────────────────────────────────────────────────────────
async function legUpload(S, fails) {
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
    const U = await S.upload()
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

    // ②b A FILE WRITTEN AT UPLOAD TIME (HPDM's first compressed Publish, 2026-10-30): probe asks for manifests/index.json
    // before writeIndex has made it, then writeIndex writes (and on the next pour REWRITES) it, then put sends it. A wire
    // remembered by path handed put the probe's ENOENT, or a rewritten file's old bytes. Same for a stored-br file.
    const lastBody = () => { let n = 0; while (existsSync(join(tmp, `put-${n + 1}.body`))) n++; return readFileSync(join(tmp, `put-${n}.body`)) }
    mkdirSync(join(tmp, 'mf'))
    const idx = { abs: join(tmp, 'mf', 'index.json'), key: 'baked/fx/manifests/index.json', bytes: 0, cache: 'x', index: { town: 'fx', copyKey: 'baked/fx/manifests/aaaa.json', writtenAt: null } }
    const late = { abs: join(tmp, 'mf', 'late.bin'), key: 'baked/fx/late.bin', bytes: 0, cache: 'x' }
    for (const [round, copyKey] of [[1, 'baked/fx/manifests/aaaa.json'], [2, 'baked/fx/manifests/bbbb.json']]) {
      try {
        await U.probe([idx, late], 2)
        idx.index.copyKey = copyKey
        await U.writeIndex(idx)
        const binRaw = randomBytes(5000 + round); writeFileSync(late.abs, binRaw)
        await U.put(idx)
        if (!lastBody().equals(readFileSync(idx.abs))) fails.push(`②b put sent manifests/index.json's ${round === 1 ? 'probe-time' : 'previous'} bytes, not what writeIndex wrote (round ${round})`)
        await U.put(late)
        if (!brotliDecompressSync(lastBody()).equals(binRaw)) fails.push(`②b put sent a rewritten .bin's old brotli (round ${round})`)
      } catch (err) { fails.push(`②b probe → writeIndex → put failed (round ${round}): ${err.message}`) }
    }
  } finally {
    process.env.PATH = was.PATH; if (was.ASSET_BASE == null) delete process.env.ASSET_BASE; else process.env.ASSET_BASE = was.ASSET_BASE
    server.close(); rmSync(tmp, { recursive: true, force: true })
  }
}

// ── ③ the Workers ───────────────────────────────────────────────────────────────────────────────────────────
async function legWorkers(S, fails) {
  const NativeResponse = globalThis.Response, inits = []
  globalThis.Response = class extends NativeResponse { constructor(body, init) { super(body, init); inits.push(init || {}) } }
  try {
    const enc = { key: 'baked/demo/ground.0123456789abcdef.bin', size: 7, httpEtag: '"e"', body: new Uint8Array(7), httpMetadata: { contentType: 'application/octet-stream', contentEncoding: 'br' } }
    const raw = { key: 'baked/demo/scene.0123456789abcdef.json', size: 5, httpEtag: '"r"', body: new Uint8Array(5), httpMetadata: { contentType: 'application/json; charset=utf-8' } }
    const R2 = { 'hosts/demo.online.json': { json: async () => ({ v: 2, app: 'legacy', map: 'demo', look: 'demo' }) }, [enc.key]: enc, [raw.key]: raw }
    const gets = []
    const env = { ASSETS: { get: async (k, o) => { gets.push({ k, range: !!o?.range }); return R2[k] ?? null }, head: async (k) => R2[k] ?? null } }
    const W = (await S.prod()).default
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

    const St = (await S.staging()).default
    const senv = { SLAB_BASE: 'https://assets.theward.online/staging/', PLAYER_PREFIX: 'staging/player/',
      ASSETS: { get: async (k) => (k === 'staging/player/x.bin' ? { ...enc, key: k } : null), head: async () => null } }
    inits.length = 0
    const sr = await St.fetch(new Request('https://staging.theward.online/_player/x.bin'), senv)
    if (sr.headers.get('content-encoding') !== 'br' || inits.at(-1)?.encodeBody !== 'manual') fails.push(`③ staging-sites sends a stored-br object with content-encoding ${sr.headers.get('content-encoding')}, encodeBody ${JSON.stringify(inits.at(-1)?.encodeBody)}`)
  } finally { globalThis.Response = NativeResponse }
}

// ── ④ by source ─────────────────────────────────────────────────────────────────────────────────────────────
function legSource(S, fails) {
  const v = S.text('verify')
  if (!/'accept-encoding': readBackEncoding\(f\.key\)/.test(v)) fails.push('④ verify-baked-in-r2 does not HEAD with slabWire#readBackEncoding')
  if (!/\(await wireOf\(f\.abs, f\.key\)\)\.bytes/.test(v)) fails.push('④ verify-baked-in-r2 does not compare the STORED length (slab-wire.mjs#wireOf)')
  const b = S.text('backup')
  if (!/getStored\([^)]*readBackEncoding|const want = readBackEncoding\(rel\)/.test(b) || !/strong !== md5\(r\.body\)/.test(b)) fails.push('④ backup-prod-slab does not compare the stored bytes to a strong etag')
}

async function run(S) {
  const fails = []
  await legRule(S, fails); await legWireRace(S, fails); await legUpload(S, fails); await legWorkers(S, fails); legSource(S, fails)
  return fails
}

// ── mutants: each one rule changed, in memory (sources(mut)); nothing is written beside a source ──────────────────
const MUTANTS = [
  ['.bin stored raw (the octet-stream path restored)', 'wire', "bin: ['application/octet-stream', BR]", "bin: ['application/octet-stream', PACKED]"],
  ['the stored file named after the encode (the race)', 'slabWireNode', "const out = join(_dir, `${sha}.${enc}`)\n    const p = encodeBytes(raw).then((body) => {", "const p = encodeBytes(raw).then((body) => {\n      const out = join(_dir, `${_encoded.size}-x.${enc}`)"],
  ['the encode remembered by path (a rewritten file keeps its old bytes)', 'slabWireNode', 'const k = `${enc}\\0${sha}`', 'const k = `${enc}\\0${abs}`'],
  ['the read remembered by path, a rejection with it (the HPDM ENOENT)', 'slabWireNode', 'const raw = readFileSync(abs)', 'const raw = ((globalThis.__seen ??= {})[abs] ??= (() => { try { return readFileSync(abs) } catch (e) { return e } })()); if (raw instanceof Error) throw raw'],
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

const fails = await run(sources())
if (fails.length) { console.error(`⛔ the slab does not ship compressed:\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log('✅ the slab ships compressed: .bin/.glb stored br and put that way, read back as stored, served with encodeBody manual and no ranges')

if (process.argv.includes('--mutants')) {
  let alive = 0
  // ⛔ the controls: a no-op edit through each in-memory path must read GREEN, else every mutant's "RED" is the loader's
  for (const which of ['wire', 'slabWireNode', 'upload', 'prod', 'staging']) {
    const f = await run(sources({ which, edit: (s) => s }))
    if (f.length) { console.error(`⛔ the in-memory ${which} fails unmutated — the mutants prove nothing:\n   ${f.join('\n   ')}`); process.exit(1) }
  }
  for (const [name, which, from, to] of MUTANTS) {
    const src = readFileSync(P[which], 'utf8')
    if (!src.includes(from)) { console.error(`⛔ mutant "${name}": its target text is gone from ${P[which]} — re-aim it`); alive++; continue }
    const edit = name === 'probe compares the raw bytes'
      ? (s) => s.replace(from, to).replace('export async function probe', "const md5raw = (a) => createHash('md5').update(readFileSync(a)).digest('hex')\nexport async function probe")
      : (s) => s.replace(from, to)
    let red, threw = ''
    try { red = (await run(sources({ which, edit }))).length > 0 } catch (e) { red = true; threw = ` (by throwing: ${e.message.slice(0, 80)})` }   // as its crashed copy was
    console.log(`   ${red ? 'RED  ' : 'ALIVE'} ${name}${threw}`)
    if (!red) alive++
  }
  if (alive) { console.error(`⛔ ${alive} mutant(s) survived — the check cannot see that edit`); process.exit(1) }
  console.log(`✅ all ${MUTANTS.length} mutants RED`)
}
