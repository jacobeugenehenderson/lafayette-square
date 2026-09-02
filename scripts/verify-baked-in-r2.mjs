#!/usr/bin/env node
/**
 * verify-baked-in-r2.mjs — prove the slab in R2 is COMPLETE and matches local.
 *
 *   node scripts/verify-baked-in-r2.mjs              # every look
 *   node scripts/verify-baked-in-r2.mjs --look=toy   # one look
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
 * Compares Content-Length against local byte size via HEAD — cheap, and enough to
 * catch absence, truncation and drift. It does NOT hash: a byte-identical-length
 * corruption would pass, which is a trade for being able to run it in seconds.
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BAKED_ROOT = join(REPO_ROOT, 'public/baked')
const BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')

// Re-declared, NOT imported from the uploader — see the header note.
const EXCLUDE = [
  { test: (p) => /-lod0\.glb$/.test(p),                        why: 'lod0 (.gitignore:287)' },
  { test: (p) => /\/trees-atlas-[^/]*-viz\.png$/.test(p),      why: 'atlas viz (.gitignore:242)' },
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
  for (const abs of walk(join(BAKED_ROOT, l))) {
    const key = relative(REPO_ROOT, abs).split('\\').join('/').replace(/^public\//, '')
    if (EXCLUDE.some((e) => e.test('/' + key))) continue
    files.push({ key, bytes: statSync(abs).size })
  }
}

console.log(`verifying ${files.length} objects against ${BASE}`)

const missing = [], mismatched = []
let done = 0
const queue = [...files]
await Promise.all(Array.from({ length: conc }, async () => {
  for (let f = queue.pop(); f; f = queue.pop()) {
    try {
      // ⛔ accept-encoding: identity is LOAD-BEARING. Node's fetch requests gzip by
      // default, Cloudflare compresses, undici transparently decompresses and DROPS
      // content-length — so every object reads back as 0 bytes and the verifier
      // reports a total, false failure. (It did, first run.) curl does not ask for
      // compression, which is why a curl spot-check disagreed with the script.
      // ⛔ RETRY. A transient socket error is not a missing object. Without this the
      // verifier reported 418 false MISSINGs under concurrency — and a verifier that
      // cries wolf about a slab you are about to delete the only other copy of is
      // worse than no verifier.
      let r = null, lastErr = null
      for (let attempt = 0; attempt < 4 && !r; attempt++) {
        try {
          r = await fetch(BASE + f.key, { method: 'HEAD', headers: { 'accept-encoding': 'identity' } })
        } catch (e) {
          lastErr = e
          await new Promise((res) => setTimeout(res, 150 * 2 ** attempt))
        }
      }
      if (!r) missing.push({ ...f, status: `network: ${lastErr?.message}` })
      else if (!r.ok) missing.push({ ...f, status: r.status })
      else {
        const remote = Number(r.headers.get('content-length'))
        if (remote !== f.bytes) mismatched.push({ ...f, remote })
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
console.log(`\n✅ all ${files.length} objects present and byte-length-identical (${mb} MB) across: ${looks.join(', ')}`)
