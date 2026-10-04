#!/usr/bin/env node
/**
 * upload-baked-to-r2.mjs — push the baked slab to R2.
 *
 *   node scripts/upload-baked-to-r2.mjs --env=staging --dry-run   # plan only
 *   node scripts/upload-baked-to-r2.mjs --env=staging --look=altadena
 *   node scripts/upload-baked-to-r2.mjs --env=prod                # promote, all looks
 *   node scripts/upload-baked-to-r2.mjs --env=staging --force     # re-put everything
 *   node scripts/upload-baked-to-r2.mjs --env=staging --look=huron --names=sha256-16 --dry-run
 *
 * ⭐ `--names=sha256-16` — PUBLISH UNDER CONTENT NAMES (BRIEF-slab-loading §3 step 3). Each file
 * is written TWICE: at its plain key (300 s, for players pinned before the resolver) and at
 * `<name>.<sha16>.<ext>` (immutable, `src/lib/slabNames.js`). Then a versioned copy of the
 * manifest (`manifests/<sha16>.json`), then `manifests/index.json` (what the retirement sweep
 * reads), then `manifest.json` LAST, stamped `names: "sha256-16"`, no-cache — the switch: a
 * visitor holding the previous manifest keeps resolving the files it named, which are never
 * overwritten. ⛔ It REFUSES a town whose manifest.json disagrees with the files on disk — the
 * manifest is the name table, and a stale one names bytes that are not being uploaded.
 * The bake writes it (its `manifest` step); by hand: ▶ node cartograph/bake-manifest.mjs --town=<town>.
 * Without the flag the upload is exactly the plain one below.
 *
 * ⭐ INCREMENTAL BY DEFAULT. It HEADs each key first and puts only what is missing or
 * whose bytes differ (`probe`); `--force` puts everything. Every uncertain answer
 * uploads, so the check can only ever remove PROVEN-redundant work.
 * ⛔ It is not a completeness gate and cannot be used as one — `verify-baked-in-r2.mjs`
 * is, and it re-derives the answer independently:
 *   ASSET_BASE=https://assets.theward.online/staging/ node scripts/verify-baked-in-r2.mjs --look=<look>
 *
 * ⛔⛔ `--env` IS REQUIRED AND HAS NO DEFAULT, and that is the whole point of this file
 * since 2026-09-03. Before it, every bake wrote the keys PRODUCTION reads: one bucket,
 * no prefix, both workflows resolving the same VITE_ASSET_BASE. So a pour went live on
 * lafayette-square.com the instant it uploaded — no push, no gate, no preview, and no way
 * back except re-baking a slab you may no longer have. Code had a staging loop; DATA had
 * none. (Jacob, 2026-09-03: "the bigger issue is there's no way to preview it before it
 * goes live.") The consequence was known and written at the bake's call site — "per-
 * environment prefixes are the fix if it ever bites" — and it bit.
 *
 * ⛔ Defaulting this to `staging` would be as wrong as defaulting it to `prod`: a silent
 * default is how the operator stops knowing which one they are shipping to. Say it.
 *
 * Keys mirror the on-disk tree exactly under the env's prefix —
 * `public/baked/<look>/x` → `<prefix>baked/<look>/x` — so the runtime's
 * `${ASSET_BASE}baked/<look>/…` join stays a pure substitution: the environment lives in
 * ASSET_BASE, never in the app. Pouring town #2 still needs no code change.
 *   prod    → `baked/<look>/…`            (unchanged, so nothing already live moves)
 *   staging → `staging/baked/<look>/…`
 *
 * ⛔⛔ THE EXCLUSIONS BELOW ARE LOAD-BEARING AND THIS FILE IS NOW THEIR ONLY HOME.
 * Today they are enforced by `.gitignore` (an untracked file cannot reach a deploy,
 * because the deploy is an `actions/checkout`). Once the baked tree is gitignored
 * wholesale, those per-file rules stop discriminating anything — every rule matches
 * an already-ignored path — and the decision they encode would be silently lost.
 * A naive `sync public/baked → bucket` re-uploads 353.3 MB per town that no visitor
 * ever fetches. Measured:
 *   find public/baked -name '*-lod0.glb' -exec stat -f%z {} + | awk '{s+=$1} END{printf "%.1f MB / %d files\n", s/1048576, NR}'
 *
 * ⛔ NO FALLBACK. A failed put is a hard, non-zero exit naming the key. A partially
 * uploaded slab that reports success is the worst outcome available here: the map
 * renders and the canopy does not, and nobody is told (`CLAUDE.md` Layer 0, q2).
 */
import { readdirSync, statSync, createReadStream, readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { HASHED, CACHE, contentName, shaOf } from '../src/lib/slabNames.js'
import { EXCLUDE, notPublished } from './slab-publish-rule.mjs'

const execFileAsync = promisify(execFile)
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BAKED_ROOT = join(REPO_ROOT, 'public/baked')

/** The bucket. Override with R2_BUCKET for a staging/scratch bucket. */
const BUCKET = process.env.R2_BUCKET || 'theward-assets'

/**
 * The public origin the bucket is served from, used ONLY by the dirty-check to read
 * back what is already there. Keys already carry their env prefix, so one base serves
 * both environments. Same default as `verify-baked-in-r2.mjs`.
 */
const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')

/**
 * ⭐ ONE BUCKET, TWO PREFIXES. `prod` keeps the historical un-prefixed keys so promoting
 * writes exactly where the live site already reads — this change moves nothing that is
 * already serving. `staging` is additive.
 * ⛔ Keep in step with the VITE_ASSET_BASE repo variables the workflows read; the drift
 * between them is the same class as the publish-branch drift that went unnoticed for four
 * weeks. `checks/claims-the-slab-envs-do-not-collide.mjs` is the guard.
 */
const ENV_PREFIX = { prod: '', staging: 'staging/' }

function resolveEnv(argv) {
  const raw = argv.find((a) => a.startsWith('--env='))?.split('=')[1]
  if (!raw) {
    throw new Error('--env is REQUIRED and has no default. Use --env=staging to publish a '
      + 'preview, or --env=prod to promote it live. Guessing here is how a slab reaches '
      + 'lafayette-square.com without anyone deciding it should.')
  }
  if (!(raw in ENV_PREFIX)) {
    throw new Error(`unknown --env="${raw}" — expected one of: ${Object.keys(ENV_PREFIX).join(', ')}`)
  }
  return raw
}

// What is not published: scripts/slab-publish-rule.mjs (one rule, shared with bake-manifest's `files`).

const MIME = {
  '.json': 'application/json', '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.svg': 'image/svg+xml', '.txt': 'text/plain',
}

/**
 * Cache-Control, from `src/lib/slabNames.js#CACHE`: a PLAIN key stays short (300 s, revalidated
 * by ETag) because its URL does not change when its bytes do; a CONTENT name is immutable because
 * it cannot; the manifest and its index are no-cache — they are the switch.
 */

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name)
  return e.isDirectory() ? walk(p) : e.isFile() ? [p] : []
})

const sha256 = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex')

/**
 * What to put, in ORDER. `root` is the directory holding `<look>/…` (public/baked by default).
 * `names`: undefined → the plain upload; HASHED → the content-named, dual-write upload (header).
 */
export function plan({ look, prefix, root = BAKED_ROOT, names } = {}) {
  if (names != null && names !== HASHED) throw new Error(`unknown --names="${names}" — the one scheme is "${HASHED}"`)
  let looks
  try {
    looks = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    throw new Error(`no baked tree at ${root} — nothing to upload`)
  }
  if (look) {
    if (!looks.includes(look)) throw new Error(`no such look "${look}" — have: ${looks.join(', ')}`)
    looks = [look]
  }
  if (!looks.length) throw new Error('public/baked/ has no looks in it — refusing to "succeed" at uploading nothing')

  const files = [], skipped = []
  for (const l of looks) {
    const town = join(root, l)
    const base = `${prefix}baked/${l}/`
    const own = []
    const why = notPublished(town, l)      // lod0, viz sheets, and an all-impostor town's model-tree files
    for (const abs of walk(town)) {
      const rel = relative(town, abs).split('\\').join('/')      // <rel> under baked/<look>/
      const key = base + rel
      const no = why(rel)
      if (no) { skipped.push({ key, bytes: statSync(abs).size, why: no }); continue }
      own.push({ abs, rel, key, bytes: statSync(abs).size, cache: CACHE.plain })
    }
    if (!names) { files.push(...own); continue }

    // ── content names ────────────────────────────────────────────────────────────
    const mPath = join(town, 'manifest.json')
    if (!existsSync(mPath)) {
      throw new Error(`"${l}" has no manifest.json — a content-named upload needs the name table. `
        + `▶ node cartograph/bake-manifest.mjs --town=${l}`)
    }
    const manifest = JSON.parse(readFileSync(mPath, 'utf8'))
    const payload = own.filter((f) => f.rel !== 'manifest.json')
    const stale = []
    const hashed = payload.map((f) => {
      let want
      try { want = shaOf(manifest, f.rel) } catch { stale.push(`${f.rel} (not in the manifest)`); return null }
      const got = sha256(f.abs)
      if (got !== want) { stale.push(`${f.rel} (manifest ${want.slice(0, 16)}, disk ${got.slice(0, 16)})`); return null }
      return { ...f, key: base + contentName(f.rel, got), cache: CACHE.hashed }
    })
    if (stale.length) {
      throw new Error(`"${l}"'s manifest.json disagrees with ${stale.length} file(s) on disk — it would publish `
        + `names for bytes that are not being uploaded:\n     ${stale.slice(0, 12).join('\n     ')}`
        + `${stale.length > 12 ? `\n     …and ${stale.length - 12} more` : ''}\n   ▶ node cartograph/bake-manifest.mjs --town=${l}`)
    }
    const stamped = JSON.stringify({ ...manifest, names: HASHED }, null, 2) + '\n'
    const stampedSha = createHash('sha256').update(stamped).digest('hex')
    const tmp = mkdtempSync(join(tmpdir(), `slab-manifest-${l}-`))
    const stampedAbs = join(tmp, 'manifest.json')
    writeFileSync(stampedAbs, stamped)
    const copyKey = `${base}manifests/${stampedSha.slice(0, 16)}.json`
    // The index is completed at upload time (it appends to what is published); the plan names it.
    const indexAbs = join(tmp, 'index.json')
    files.push(
      ...hashed,                                                   // 1. every content name — nothing points at them yet
      ...payload,                                                  // 2. the plain keys, for pinned pre-resolver players
      { abs: stampedAbs, rel: `manifests/${stampedSha.slice(0, 16)}.json`, key: copyKey, bytes: Buffer.byteLength(stamped), cache: CACHE.hashed },
      { abs: indexAbs, rel: 'manifests/index.json', key: `${base}manifests/index.json`, bytes: 0, cache: CACHE.manifest,
        index: { town: l, copyKey, writtenAt: manifest.writtenAt ?? null } },
      { abs: stampedAbs, rel: 'manifest.json', key: `${base}manifest.json`, bytes: Buffer.byteLength(stamped), cache: CACHE.manifest },
    )
  }
  return { looks, files, skipped }
}

/**
 * manifests/index.json — the published history the retirement sweep reads (newest last). Read
 * back from the bucket and appended to; ⛔ an unreadable index (not a 404) stops the upload,
 * because rewriting it from nothing would forget manifests a visitor may still hold.
 */
async function writeIndex(f) {
  const r = await fetch(PUBLIC_BASE + f.key, { cache: 'no-store' })
  let prior = { town: f.index.town, manifests: [] }
  if (r.ok) prior = await r.json()
  else if (r.status !== 404) throw new Error(`cannot read ${f.key} (${r.status}) — refusing to rewrite the manifest history blind`)
  const manifests = prior.manifests.filter((m) => m.key !== f.index.copyKey)
  manifests.push({ key: f.index.copyKey, writtenAt: f.index.writtenAt, uploadedAt: new Date().toISOString() })
  writeFileSync(f.abs, JSON.stringify({ town: f.index.town, manifests }, null, 2) + '\n')
  f.bytes = statSync(f.abs).size
}

const mb = (b) => (b / 1048576).toFixed(1) + ' MB'

/**
 * ⛔ RETRY. R2's API returns a transient 500 on a small fraction of puts, and at 915
 * objects a sub-1% per-request failure rate reliably kills a whole pour: one casualty
 * fails the bake (`cartograph/serve.js`), so the operator waits out the full upload and
 * gets a red box naming a file that is perfectly fine. Measured 2026-09-04 — one run
 * failed 3 objects, the next failed 1, a DIFFERENT one, and re-putting it by hand
 * succeeded on the first attempt.
 * ⭐ `verify-baked-in-r2.mjs` already learned exactly this ("a transient socket error is
 * not a missing object… 418 false MISSINGs under concurrency") and the uploader — same
 * bucket, same concurrency, same class of error — never got the lesson.
 * ⛔ This is NOT a fallback: attempts are bounded, and an exhausted put still lands in
 * `failures`, still names its key, and still exits non-zero. It converts a flaky
 * transport into a slow one, never a failure into a success.
 */
const RETRIES = 4
async function withRetry(label, fn) {
  let lastErr
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try { return await fn() } catch (err) {
      lastErr = err
      if (attempt < RETRIES - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
    }
  }
  throw lastErr
}

async function put({ abs, key, cache }) {
  const args = ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`,
    '--file', abs, '--remote',
    '--content-type', MIME[extname(key).toLowerCase()] || 'application/octet-stream',
    '--cache-control', cache]
  await withRetry(key, () => execFileAsync('npx', args, { cwd: REPO_ROOT, maxBuffer: 1 << 24 }))
}

const md5 = (abs) => new Promise((res, rej) => {
  const h = createHash('md5')
  createReadStream(abs).on('data', (d) => h.update(d)).on('error', rej)
    .on('end', () => res(h.digest('hex')))
})

/**
 * ⭐ THE DIRTY-CHECK — ask the REMOTE what is already there, never a local memory of it.
 * A manifest of "what we uploaded last time" is a memory, and it cannot see an object
 * deleted out from under it; the ETag on the object can. For a single-part put R2's ETag
 * IS the MD5 of the bytes, so a match is proof of identity, not a proxy for it.
 *
 * ⛔ EVERY UNCERTAIN ANSWER UPLOADS. Absent, wrong size, non-200, a multipart ETag we
 * cannot compare (`<md5>-<n>`), or a network error that outlived its retries — all fall
 * through to a re-put. The check may only ever REMOVE work it has positively proven
 * redundant, so its failure mode is a slow pour, never a silent hole in the slab.
 * ⚠️ It reads through the CDN, whose Cache-Control is 300s. A stale edge answer can only
 * disagree with fresh local bytes, which uploads — the safe direction. `--force` skips
 * the check entirely; `verify-baked-in-r2.mjs` remains the independent completeness gate.
 */
async function probe(files, conc) {
  const fresh = new Set()
  let done = 0
  const queue = [...files]
  await Promise.all(Array.from({ length: Math.max(1, conc) }, async () => {
    for (let f = queue.pop(); f; f = queue.pop()) {
      try {
        const r = await withRetry(f.key, () => fetch(PUBLIC_BASE + f.key, {
          method: 'HEAD', headers: { 'accept-encoding': 'identity' },
        }))
        const etag = (r.headers.get('etag') || '').replace(/^W\//, '').replace(/"/g, '')
        if (r.ok && Number(r.headers.get('content-length')) === f.bytes
            && etag && !etag.includes('-') && etag === await md5(f.abs)) {
          fresh.add(f.key)
        }
      } catch { /* uncertain ⇒ upload */ }
      if (++done % 100 === 0 || done === files.length) process.stdout.write(`\r  probed ${done}/${files.length}`)
    }
  }))
  process.stdout.write('\n')
  return fresh
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const force = argv.includes('--force')
  const look = argv.find((a) => a.startsWith('--look='))?.split('=')[1]
  const conc = Number(argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || 8)
  const names = argv.find((a) => a.startsWith('--names='))?.split('=')[1]
  const env = resolveEnv(argv)
  const prefix = ENV_PREFIX[env]

  const { looks, files, skipped } = plan({ look, prefix, names })
  const total = files.reduce((s, f) => s + f.bytes, 0)
  const skipBytes = skipped.reduce((s, f) => s + f.bytes, 0)

  // ⭐ SAY WHICH ENVIRONMENT, FIRST AND LOUDEST. The one thing an operator must never
  // have to infer is whether they are about to overwrite what visitors are looking at.
  console.log(env === 'prod'
    ? `env      PROD — these keys are what lafayette-square.com serves. Live on upload.`
    : `env      staging — preview only; promote with --env=prod when it looks right.`)
  console.log(`bucket   ${BUCKET}`)
  console.log(`prefix   ${prefix || '(none — production keys)'}`)
  console.log(`looks    ${looks.join(', ')}`)
  console.log(`upload   ${files.length} files, ${mb(total)}`)
  console.log(`skip     ${skipped.length} files, ${mb(skipBytes)} (not published — by rule, see EXCLUDE)`)
  for (const e of EXCLUDE) {
    const n = skipped.filter((s) => s.why === e.why)
    if (n.length) console.log(`           ${n.length} × ${e.why} — ${mb(n.reduce((s, f) => s + f.bytes, 0))}`)
  }
  if (names) {
    const h = files.filter((f) => f.cache === CACHE.hashed)
    console.log(`names    ${names} — ${h.length} content-named keys (immutable) + ${files.length - h.length} plain/switch keys, manifest.json LAST`)
    for (const f of h.slice(0, 5)) console.log(`           ${f.key}`)
    if (h.length > 5) console.log(`           …and ${h.length - 5} more`)
    console.log(`cache    content ${CACHE.hashed} · plain ${CACHE.plain} · manifest ${CACHE.manifest}`)
  } else {
    console.log(`names    plain (no --names) · cache ${CACHE.plain}`)
  }

  // ⭐ Only put what is not already there, byte-for-byte. A pour whose dirty-gate skipped
  // every bake step used to re-put all 915 objects anyway — ~915 `npx wrangler` spawns
  // for zero changed bytes, which is most of the wait an operator sits through.
  let pending = files
  if (!force) {
    console.log(`probe    reading ${files.length} objects back from ${PUBLIC_BASE}`)
    const fresh = await probe(files, Math.max(conc, 16))
    pending = files.filter((f) => !fresh.has(f.key))
    console.log(`unchanged ${fresh.size} objects already identical in R2 — not re-uploaded`)
    console.log(`to upload ${pending.length} files, ${mb(pending.reduce((s, f) => s + f.bytes, 0))}`)
  } else {
    console.log(`probe    SKIPPED (--force) — re-uploading every object`)
  }

  if (dryRun) { console.log('\n--dry-run: nothing uploaded.'); return }
  if (!pending.length) { console.log(`\n✅ ${files.length} objects, ${mb(total)} → ${BUCKET} (all already current)`); return }

  // ⭐ In a content-named upload the ORDER is the safety: every content name, then the plain keys,
  // and only then the manifest copy, the index and manifest.json — each stage finishing before the
  // next starts, and a failure stopping before anything points at a missing file.
  const stages = names
    ? [pending.filter((f) => f.cache === CACHE.hashed && !/\/manifests\//.test(f.key)),
       pending.filter((f) => f.cache === CACHE.plain),
       ...pending.filter((f) => /\/manifests\/|\/manifest\.json$/.test(f.key) && f.cache !== CACHE.plain).map((f) => [f])]
    : [pending]
  let done = 0
  const failures = []
  for (const stage of stages) {
    if (failures.length) break
    const queue = [...stage]
    await Promise.all(Array.from({ length: Math.max(1, conc) }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try { if (f.index) await writeIndex(f); await put(f) } catch (err) { failures.push({ key: f.key, err: err.stderr || err.message }) }
        if (++done % 50 === 0 || done === pending.length) {
          process.stdout.write(`\r  ${done}/${pending.length}`)
        }
      }
    }))
  }
  process.stdout.write('\n')

  // ⛔ Loud. A partial slab must never exit 0.
  if (failures.length) {
    console.error(`\n⛔ ${failures.length} of ${pending.length} objects FAILED after ${RETRIES} attempts each — the slab in R2 is INCOMPLETE.`)
    for (const f of failures.slice(0, 20)) console.error(`   ${f.key}\n     ${String(f.err).trim().split('\n')[0]}`)
    if (failures.length > 20) console.error(`   …and ${failures.length - 20} more`)
    process.exit(1)
  }
  console.log(`\n✅ ${files.length} objects, ${mb(total)} → ${BUCKET} (${pending.length} uploaded, ${files.length - pending.length} already current)`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => { console.error(`⛔ ${err.message}`); process.exit(1) })
}
