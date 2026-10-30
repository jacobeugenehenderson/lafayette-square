// backup-prod-slab.mjs — READ-ONLY: download a town's PRODUCTION slab (R2 `baked/<look>/…`, served at
// assets.theward.online/baked/<look>/) into a local folder, so a Promote that overwrites it in place can be undone.
// Production slab keys are overwritten in place, not versioned (scripts/upload-baked-to-r2.mjs --env=prod), so this
// copy is the only rollback a slab has (Ward, 2026-10-21).
//
//   node scratch/promote-rollback/backup-prod-slab.mjs --look=hipointedemun --out=<dir> --list-from=<dir> [--list-from=<dir> …]
//
// The key list is every file under each --list-from <look> folder (the slab on disk, and the candidate about to replace
// it), minus what the uploader never publishes (lod0, -viz.png). Each key is fetched AS STORED (src/lib/slabWire.js: a
// .bin/.glb is stored brotli) and the md5 of those stored bytes checked against R2's strong etag, then written decoded:
// the backup holds the raw files the uploader takes (it re-encodes on the way back). A key production doesn't have is
// recorded as absent (a rollback deletes it), never skipped silently.
// Writes <out>/BACKUP.json: { look, at, kept: {rel: md5}, absent: [rel], mismatched: [rel] }. Exits non-zero on any
// mismatch or failed fetch: a partial backup that reports success is the outcome this exists to prevent.

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { get } from 'node:https'
import { brotliDecompressSync } from 'node:zlib'
import { readBackEncoding } from '../../src/lib/slabWire.js'

// ⛔ node:https, not fetch: fetch DECODES a br body whatever was asked, so its md5 would be the raw file's and never the
// stored bytes' the etag names. Asked with the read-back encoding, the edge answers with the stored bytes and a strong etag.
const getStored = (url, enc) => new Promise((ok, no) => get(url, { headers: { 'accept-encoding': enc } }, (res) => {
  const parts = []; res.on('data', (d) => parts.push(d)); res.on('error', no)
  res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }))
}).on('error', no))

const arg = (k) => process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.slice(k.length + 3))
const [look] = arg('look'), [out] = arg('out'), lists = arg('list-from')
if (!look || !out || !lists.length) throw new Error('usage: --look=<look> --out=<dir> --list-from=<dir> [--list-from=<dir> …]')

const walk = (root, d = root) => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(root, p) : [relative(root, p)] })
const keys = [...new Set(lists.flatMap(l => walk(join(l, look))))]
  .filter(r => !/lod0/.test(r) && !/-viz\.png$/.test(r) && !r.endsWith('.DS_Store')).sort()

const base = `https://assets.theward.online/baked/${look}/`
const kept = {}, absent = [], mismatched = [], failed = []
let i = 0
await Promise.all(Array.from({ length: 12 }, async () => {
  while (i < keys.length) {
    const rel = keys[i++]
    try {
      // ⛔ Cache-busted: a plain GET warms the edge with the OLD bytes, which it then serves for max-age after the upload
      // replaces them (2026-10-22 HPDM press: 6 of 18 plain URLs stale for ~3 min after a backup taken just before).
      const want = readBackEncoding(rel)
      const r = await getStored(base + rel.split('/').map(encodeURIComponent).join('/') + `?backup=${Date.now()}`, want)
      if (r.status === 404) { absent.push(rel); continue }
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`)
      const enc = r.headers['content-encoding'] || 'identity'
      // A weak etag is a body the edge transformed: not the stored bytes, so it proves nothing — a mismatch.
      const etag = String(r.headers.etag || ''), strong = etag && !etag.startsWith('W/') ? etag.replace(/"/g, '') : null
      const md5 = (b) => createHash('md5').update(b).digest('hex')
      if (!strong || strong !== md5(r.body)) mismatched.push(rel)
      if (enc !== 'identity' && enc !== 'br') throw new Error(`served ${enc}, which this backup does not decode`)
      const buf = enc === 'br' ? brotliDecompressSync(r.body) : r.body
      const f = join(out, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, buf); kept[rel] = md5(buf)
    } catch (e) { failed.push(`${rel}: ${e.message}`) }
  }
}))
writeFileSync(join(out, 'BACKUP.json'), JSON.stringify({ look, at: new Date().toISOString(), base, kept, absent: absent.sort(), mismatched: mismatched.sort(), failed }, null, 1))
console.log(`kept ${Object.keys(kept).length} · absent in production ${absent.length} · md5≠etag ${mismatched.length} · failed ${failed.length} → ${out}`)
if (mismatched.length || failed.length) { console.error([...mismatched.map(m => 'MISMATCH ' + m), ...failed].slice(0, 20).join('\n')); process.exit(1) }
