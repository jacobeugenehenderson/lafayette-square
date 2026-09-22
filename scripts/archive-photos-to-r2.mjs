#!/usr/bin/env node
/**
 * archive-photos-to-r2 — put a town's photograph ARCHIVE somewhere that is not a laptop.
 *
 * ⛔⛔ IGNORING IS NOT BACKING UP. `.gitignore` now excludes ~1 GB of photograph libraries
 * (Jacob, 2026-09-22: "the bulky libraries must be git ignored"), which is right — none of
 * it is read by any code and git is not an archive. But an ignored directory lives on
 * exactly one machine, and the ARCHIVE tier is the one thing here that cannot be
 * regenerated: the web copies rebuild from it in seconds, and it rebuilds from nothing.
 *
 * ⛔ `source_url` IS NOT A PATH BACK. Huron alone produced three local domains that lapsed
 * inside a year and were re-registered by squatters serving casinos. Re-fetching an archive
 * a year from now would return someone else's pictures, or nothing.
 *
 * ⭐ AND THIS IS WHERE IT WAS ALWAYS GOING (Jacob: *"this is also why we moved to
 * cloudflare; there will be bulk of both temporary and permanent natures. We only carry a
 * hood as long as we're building it"*). The repo carries a town's mass while the town is
 * under construction; the finished mass lives in R2 — which is also where a client's own
 * copy will live when they take their photographs over.
 *
 * ⭐ IT REUSES `upload-baked-to-r2.mjs`'s discipline rather than reimplementing it:
 * incremental by HEAD+md5, every uncertain answer uploads, and a failed put is a hard
 * non-zero exit naming the key. ⛔ A partially uploaded archive that reports success is
 * the worst outcome available — it is the state where nobody knows the originals are gone.
 *
 * ⛔ `--env` IS REQUIRED AND HAS NO DEFAULT, for the reason the slab uploader states: a
 * silent default is how the operator stops knowing which one they are shipping to.
 *
 *   node scripts/archive-photos-to-r2.mjs --env=staging --scene=huron --dry-run
 *   node scripts/archive-photos-to-r2.mjs --env=prod --scene=huron
 */
import { readdirSync, statSync, createReadStream, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.json': 'application/json' }

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1]
const DRY = process.argv.includes('--dry-run')
const ENV = arg('env')
const SCENE = arg('scene')

if (!ENV || !['staging', 'prod'].includes(ENV)) {
  console.error(`\n⛔ --env is required and has no default.\n\n` +
    `   An archive put under the wrong prefix is not visible to the environment that needs it,\n` +
    `   and a silent default is how the operator stops knowing which one they shipped to.\n\n` +
    `     node scripts/archive-photos-to-r2.mjs --env=staging --scene=<scene>\n` +
    `     node scripts/archive-photos-to-r2.mjs --env=prod    --scene=<scene>\n`)
  process.exit(2)
}
if (!SCENE) {
  console.error(`\n⛔ --scene is required. This uploads ONE town's archive; naming it is how you know which.\n`)
  process.exit(2)
}

// ⭐ The archive is NOT under the env prefix that versions the slab. A photograph is the
// same photograph in staging and production — prefixing it would store two copies of an
// 8 MB original to no purpose. The env still gates WHICH bucket path is written so a
// staging run cannot touch a production key, but the archive path itself is env-free.
const PREFIX = ENV === 'prod' ? 'photo-archive/' : 'staging/photo-archive/'

const dir = join(ROOT, 'cartograph/data', SCENE, 'photos')
if (!existsSync(dir)) {
  console.error(`\n⛔ no archive at cartograph/data/${SCENE}/photos/\n   ▶ node cartograph/fetch-photos.mjs --scene=${SCENE} builds one.\n`)
  process.exit(2)
}

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const abs = join(d, e.name)
  return e.isDirectory() ? walk(abs) : [{ abs, key: PREFIX + SCENE + '/' + relative(dir, abs), bytes: statSync(abs).size }]
})
const files = walk(dir)
if (!files.length) { console.error(`⛔ the archive at ${relative(ROOT, dir)} is empty`); process.exit(2) }

const md5 = (abs) => new Promise((res, rej) => {
  const h = createHash('md5')
  createReadStream(abs).on('data', d => h.update(d)).on('error', rej).on('end', () => res(h.digest('hex')))
})

// ⭐ Every uncertain answer uploads. The check can only ever remove PROVEN-redundant work,
// never skip something it merely failed to read.
const fresh = new Set()
await Promise.all(files.map(async f => {
  try {
    const r = await fetch(PUBLIC_BASE + f.key, { method: 'HEAD', headers: { 'accept-encoding': 'identity' } })
    const etag = (r.headers.get('etag') || '').replace(/^W\//, '').replace(/"/g, '')
    if (r.ok && Number(r.headers.get('content-length')) === f.bytes && etag && !etag.includes('-') && etag === await md5(f.abs)) fresh.add(f.key)
  } catch { /* uncertain ⇒ upload */ }
}))

const todo = files.filter(f => !fresh.has(f.key))
const mb = (n) => (n / 1e6).toFixed(1)
console.log(`\n  ${SCENE} archive → ${BUCKET}/${PREFIX}${SCENE}/`)
console.log(`  ${files.length} file(s), ${mb(files.reduce((a, f) => a + f.bytes, 0))} MB · ${fresh.size} already there · ${todo.length} to upload (${mb(todo.reduce((a, f) => a + f.bytes, 0))} MB)`)
if (DRY) { console.log('  (dry run — nothing uploaded)\n'); process.exit(0) }

let done = 0
for (const f of todo) {
  try {
    await execFileAsync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${f.key}`,
      '--file', f.abs, '--remote',
      '--content-type', MIME[extname(f.key).toLowerCase()] || 'application/octet-stream',
      '--cache-control', 'public, max-age=31536000, immutable'], { cwd: ROOT, maxBuffer: 1 << 24 })
  } catch (e) {
    // ⛔ NO FALLBACK. A partially uploaded archive that reports success is the state where
    // nobody knows the originals are gone.
    console.error(`\n⛔ FAILED on ${f.key}\n   ${String(e.stderr || e.message).split('\n')[0]}\n   ${done} of ${todo.length} uploaded before this. Nothing was deleted locally.\n`)
    process.exit(1)
  }
  done++
  if (done % 10 === 0 || done === todo.length) console.log(`     ${done}/${todo.length}`)
}
console.log(`\n  ✅ ${SCENE}'s archive is in R2 — ${files.length} file(s) under ${PREFIX}${SCENE}/`)
console.log(`  ⛔ Verify before trusting it: ASSET_BASE=${PUBLIC_BASE} and HEAD a key.\n`)
