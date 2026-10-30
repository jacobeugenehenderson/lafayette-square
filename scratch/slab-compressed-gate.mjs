// slab-compressed-gate.mjs — READ-ONLY, live: does every stored-br file of a published town arrive compressed, and
// decode to the bytes its manifest names? (BRIEF-the-slab-ships-compressed §4, after a Publish and after the Worker
// deploy, before any Promote.) Reads the town's manifest on the host, then for each file src/lib/slabWire.js stores br:
//   · a br client: content-encoding br, and the body (decoded by node's zlib, never curl's) is the manifest's sha256;
//   · a client without br (gzip, then identity): whatever the edge sends must decode to the same sha256 — and it says
//     what it got, because whether a town's zone decodes for such a client is the one thing the trial left open.
// Exits 0 only if every file passes. Prints wire vs raw bytes for the town.
//
//   node scratch/slab-compressed-gate.mjs https://assets.theward.online/staging/ provincetown     # staging (R2 domain)
//   node scratch/slab-compressed-gate.mjs https://provincetown.online/ provincetown              # production (the Worker)
import { get } from 'node:https'
import { createHash } from 'node:crypto'
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib'
import { storedEncodingFor } from '../src/lib/slabWire.js'
import { contentName } from '../src/lib/slabNames.js'
import { freshUrl } from '../src/lib/freshUrl.js'

const [base, look] = process.argv.slice(2)
if (!base || !look) throw new Error('usage: node scratch/slab-compressed-gate.mjs <asset base ending in /> <look>')
const at = `${base.replace(/\/?$/, '/')}baked/${look}/`
// node:https, not fetch: fetch decodes whatever arrives, so it could not say what arrived.
const fetchRaw = (url, ae) => new Promise((ok, no) => get(url, { headers: { 'accept-encoding': ae } }, (res) => {
  const p = []; res.on('data', (d) => p.push(d)); res.on('error', no)
  res.on('end', () => ok({ status: res.statusCode, enc: res.headers['content-encoding'] || 'identity', body: Buffer.concat(p) }))
}).on('error', no))
const DECODE = { br: brotliDecompressSync, gzip: gunzipSync, deflate: inflateSync, identity: (b) => b }
const sha = (b) => createHash('sha256').update(b).digest('hex')

const m = await fetchRaw(freshUrl(`${at}manifest.json`), 'identity')
if (m.status !== 200) throw new Error(`${at}manifest.json → HTTP ${m.status}`)
const manifest = JSON.parse(DECODE[m.enc](m.body))
const files = Object.entries(manifest.files || {}).filter(([rel]) => storedEncodingFor(rel))
if (!files.length) throw new Error(`${look}'s manifest names no file slabWire stores br — nothing to gate (a wrong look?)`)

let fail = 0, raw = 0, wire = 0
for (const [rel, f] of files) {
  const url = at + (manifest.names ? contentName(rel, f.sha256) : rel)
  for (const ae of ['br', 'gzip', 'identity']) {
    const r = await fetchRaw(freshUrl(url), ae)
    let got = null
    try { got = r.status === 200 && DECODE[r.enc] ? sha(DECODE[r.enc](r.body)) : null } catch { got = null }
    const ok = got === f.sha256 && (ae !== 'br' || r.enc === 'br')
    if (ae === 'br') { raw += f.bytes; wire += r.body.length }
    console.log(`${ok ? 'PASS' : 'FAIL'} ${rel} [${ae}] HTTP ${r.status} · ${r.enc} · ${(r.body.length / 1e6).toFixed(2)} MB${got === f.sha256 ? '' : ' · decoded ≠ manifest sha256'}`)
    if (!ok) fail++
  }
}
console.log(`\n${look} at ${at}: ${files.length} stored-br files, ${(raw / 1e6).toFixed(2)} MB raw → ${(wire / 1e6).toFixed(2)} MB on the wire to a br client · ${fail ? `⛔ ${fail} FAIL` : '✅ all pass'}`)
process.exit(fail ? 1 : 0)
