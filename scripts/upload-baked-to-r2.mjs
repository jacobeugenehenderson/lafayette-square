#!/usr/bin/env node
/**
 * upload-baked-to-r2.mjs — push the baked slab to R2.
 *
 *   node scripts/upload-baked-to-r2.mjs --env=staging --dry-run   # plan only
 *   node scripts/upload-baked-to-r2.mjs --env=staging --look=altadena
 *   node scripts/upload-baked-to-r2.mjs --env=prod                # promote, all looks
 *   node scripts/upload-baked-to-r2.mjs --env=staging --force     # re-put everything
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
import { readdirSync, statSync, createReadStream } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'

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
 * weeks. `scratch/claims-the-slab-envs-do-not-collide.mjs` is the guard.
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

/**
 * Files that are PRODUCED by the bake but deliberately NOT PUBLISHED.
 * Each entry names the rule it inherits and why — do not add one without both.
 */
const EXCLUDE = [
  {
    // .gitignore:280-288. `InstancedTrees#lodForRole` can return ONLY lod1/lod1far;
    // the camera-distance LOD swap was retired under role-at-bake, so lod0 is never
    // requested. 353.3 MB on LS alone; at 100 towns, ~20 GB nobody fetches.
    test: (p) => /-lod0\.glb$/.test(p),
    why: '.gitignore:287 — lod0 is never requested by the runtime',
  },
  {
    // .gitignore:242. Diagnostic atlas contact sheets for the operator's eye.
    test: (p) => /\/trees-atlas-[^/]*-viz\.png$/.test(p),
    why: '.gitignore:242 — atlas viz sheets are a diagnostic, not payload',
  },
]

const MIME = {
  '.json': 'application/json', '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.svg': 'image/svg+xml', '.txt': 'text/plain',
}

/**
 * ⚠️ Cache-Control is deliberately SHORT, and must stay short until every baked URL
 * carries a version token. 38.3 MB of the LS slab carries none in a production build
 * — both atlas PNGs, all 360 KTX2 impostor pages, terrain/ground maps — because
 * `bakeLastMs` is an authoring prop, undefined in prod. `immutable` on those pins a
 * stale canopy at a URL nothing can change. R2 serves ETags, so this costs
 * revalidations, not re-downloads. See plans/r2-asset-offload.md §3.5.
 */
const CACHE_CONTROL = 'public, max-age=300, must-revalidate'

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name)
  return e.isDirectory() ? walk(p) : e.isFile() ? [p] : []
})

function plan({ look, prefix }) {
  let looks
  try {
    looks = readdirSync(BAKED_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    throw new Error(`no baked tree at ${BAKED_ROOT} — nothing to upload`)
  }
  if (look) {
    if (!looks.includes(look)) throw new Error(`no such look "${look}" — have: ${looks.join(', ')}`)
    looks = [look]
  }
  if (!looks.length) throw new Error('public/baked/ has no looks in it — refusing to "succeed" at uploading nothing')

  const files = [], skipped = []
  for (const l of looks) {
    for (const abs of walk(join(BAKED_ROOT, l))) {
      const rel = relative(REPO_ROOT, abs).split('\\').join('/')   // public/baked/<look>/…
      const key = prefix + rel.replace(/^public\//, '')            // <prefix>baked/<look>/…
      const ex = EXCLUDE.find((e) => e.test('/' + key))
      if (ex) { skipped.push({ key, bytes: statSync(abs).size, why: ex.why }); continue }
      files.push({ abs, key, bytes: statSync(abs).size })
    }
  }
  return { looks, files, skipped }
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

async function put({ abs, key }) {
  const args = ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`,
    '--file', abs, '--remote',
    '--content-type', MIME[extname(key).toLowerCase()] || 'application/octet-stream',
    '--cache-control', CACHE_CONTROL]
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
  const env = resolveEnv(argv)
  const prefix = ENV_PREFIX[env]

  const { looks, files, skipped } = plan({ look, prefix })
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
  console.log(`cache    ${CACHE_CONTROL}`)

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

  let done = 0
  const failures = []
  const queue = [...pending]
  await Promise.all(Array.from({ length: Math.max(1, conc) }, async () => {
    for (let f = queue.pop(); f; f = queue.pop()) {
      try { await put(f) } catch (err) { failures.push({ key: f.key, err: err.stderr || err.message }) }
      if (++done % 50 === 0 || done === pending.length) {
        process.stdout.write(`\r  ${done}/${pending.length}`)
      }
    }
  }))
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

main().catch((err) => { console.error(`⛔ ${err.message}`); process.exit(1) })
