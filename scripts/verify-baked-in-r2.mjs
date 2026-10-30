#!/usr/bin/env node
/**
 * verify-baked-in-r2.mjs — prove the slab in R2 is COMPLETE and matches local.
 *
 *   node scripts/verify-baked-in-r2.mjs              # every look
 *   node scripts/verify-baked-in-r2.mjs --look=huron # one look
 *
 * ⛔⛔ RUN THIS BEFORE REMOVING ANYTHING FROM GIT, AND AFTER EVERY POUR.
 *
 * Once `public/baked/` is gitignored, R2 is the ONLY copy that reaches a visitor.
 * `upload-baked-to-r2.mjs` exits non-zero on a failed put, but that only covers the
 * run that happened — it cannot see an object deleted later, a pour that was never
 * uploaded, or a file whose bytes drifted. This reads the REMOTE and compares it to
 * disk, so "the upload worked" stops being a memory of a green run and becomes a
 * fact you can re-derive.
 *
 * ⭐ It checks the same inclusion set the uploader writes — it imports nothing from
 * it, it re-walks the tree and re-applies the exclusions, so the two can DISAGREE.
 * A verifier that shares its subject's definition of "everything" cannot catch a
 * wrong definition (`feedback_an_instrument_that_lies_toward_nothing_is_there`).
 *
 * Compares Content-Length against the STORED size via HEAD (the file's own size, or its brotli
 * size for a br-stored type — src/lib/slabWire.js) — cheap, and enough to catch absence,
 * truncation and drift. It does NOT hash: a byte-identical-length corruption would pass, which
 * is a trade for being able to run it in seconds (a br-stored town adds its encode, ~2 s for PTown).
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ATLAS_ONLY_FILE, IMPOSTOR_CAPTURE_FILE } from '../src/lib/treeGeometry.js'
import { treeGeometryOfTown, impostorFilesOfTown } from './slab-tree-geometry.mjs'
// How a file is STORED (raw, or brotli for a type nothing else compresses) is the type's, not the inclusion set's:
// read from the one table, so this stays independent of the uploader where independence matters.
import { readBackEncoding } from '../src/lib/slabWire.js'
import { wireOf } from './slab-wire.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BAKED_ROOT = join(REPO_ROOT, 'public/baked')
const BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')

// Re-declared, NOT imported from the uploader — see the header note.
const EXCLUDE = [
  { test: (p) => /-lod0\.glb$/.test(p),                        why: 'lod0 (.gitignore, "lod0")' },
  { test: (p) => /\/trees-atlas-[^/]*-viz\.png$/.test(p),      why: 'atlas viz (.gitignore, "-viz.png")' },
]

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name)
  return e.isDirectory() ? walk(p) : e.isFile() ? [p] : []
})

const argLook = process.argv.find((a) => a.startsWith('--look='))?.split('=')[1]
const conc = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || 8)

let looks = readdirSync(BAKED_ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
if (argLook) {
  if (!looks.includes(argLook)) { console.error(`⛔ no such look "${argLook}"`); process.exit(1) }
  looks = [argLook]
}

const files = []
for (const l of looks) {
  // An all-impostor town publishes no model GLBs or atlas PNGs. Asked of the RUNTIME's rule
  // (src/lib/treeGeometry.js), not of the uploader — so the two can still disagree.
  const geom = treeGeometryOfTown(join(BAKED_ROOT, l), l), named = impostorFilesOfTown(join(BAKED_ROOT, l))
  for (const abs of walk(join(BAKED_ROOT, l))) {
    const key = relative(REPO_ROOT, abs).split('\\').join('/').replace(/^public\//, '')
    if (EXCLUDE.some((e) => e.test('/' + key))) continue
    if (!geom.needed && ATLAS_ONLY_FILE('/' + key)) continue
    // impostor captures: only those an atlas record names (the runtime's own rule, read here, not the uploader's)
    if (IMPOSTOR_CAPTURE_FILE('/' + key) && !named.has('/' + key.replace(/^baked\/[^/]+\//, ''))) continue
    files.push({ key, abs, bytes: statSync(abs).size })
  }
}

console.log(`verifying ${files.length} objects against ${BASE}`)

const missing = [], mismatched = []
let done = 0
const queue = [...files]
await Promise.all(Array.from({ length: conc }, async () => {
  for (let f = queue.pop(); f; f = queue.pop()) {
    try {
      // ⛔ THE READ-BACK ENCODING IS LOAD-BEARING (slabWire.js#readBackEncoding). Node's fetch requests gzip
      // by default, Cloudflare compresses, undici transparently decompresses and DROPS content-length — so
      // every object read back as 0 bytes and the verifier reported a total, false failure (it did, first
      // run). A raw-stored object is asked for with identity; a br-stored one with br, so the answer is its
      // stored length — asked with identity the edge decodes it and sends no length at all.
      // ⛔ RETRY. A transient socket error is not a missing object. Without this the
      // verifier reported 418 false MISSINGs under concurrency — and a verifier that
      // cries wolf about a slab you are about to delete the only other copy of is
      // worse than no verifier.
      let r = null, lastErr = null
      for (let attempt = 0; attempt < 4 && !r; attempt++) {
        try {
          r = await fetch(BASE + f.key, { method: 'HEAD', headers: { 'accept-encoding': readBackEncoding(f.key) } })
        } catch (e) {
          lastErr = e
          await new Promise((res) => setTimeout(res, 150 * 2 ** attempt))
        }
      }
      if (!r) missing.push({ ...f, status: `network: ${lastErr?.message}` })
      else if (!r.ok) missing.push({ ...f, status: r.status })
      else {
        const remote = r.headers.has('content-length') ? Number(r.headers.get('content-length')) : 'no length'
        const want = (await wireOf(f.abs, f.key)).bytes   // the STORED length (brotli for a br-stored type)
        if (remote !== want) mismatched.push({ ...f, bytes: want, remote })
      }
    } catch (e) { missing.push({ ...f, status: e.message }) }
    if (++done % 100 === 0 || done === files.length) process.stdout.write(`\r  ${done}/${files.length}`)
  }
}))
process.stdout.write('\n')

if (missing.length || mismatched.length) {
  console.error(`\n⛔ SLAB IN R2 IS NOT COMPLETE — do not remove the local copy.`)
  for (const m of missing.slice(0, 15))    console.error(`   MISSING  ${m.key} [${m.status}]`)
  for (const m of mismatched.slice(0, 15)) console.error(`   SIZE     ${m.key} local=${m.bytes} remote=${m.remote}`)
  const extra = (missing.length + mismatched.length) - 30
  if (extra > 0) console.error(`   …and ${extra} more`)
  process.exit(1)
}
const mb = (files.reduce((s, f) => s + f.bytes, 0) / 1048576).toFixed(1)
console.log(`\n✅ all ${files.length} objects present at their stored length (${mb} MB raw) across: ${looks.join(', ')}`)
