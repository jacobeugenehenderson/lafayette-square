#!/usr/bin/env node
/**
 * promote-player-to-prod.mjs — pin THE player that was checked on staging to one town's production.
 *
 *   node scripts/promote-player-to-prod.mjs --map=<map> --look=<look>
 *   node scripts/promote-player-to-prod.mjs --map=<map> --look=<look> --dry-run
 *
 * ⭐⭐ COPY, NOT REBUILD (Jacob, 2026-09-26). Production gets the exact bytes that staging served:
 * the build named by `staging/player/build.json`, file by file from its `manifest.json`, each one
 * checked against the manifest's MD5 before it is written. ⛔ A rebuild here would ship a player
 * nobody had looked at.
 *
 * ⭐ EACH TOWN PINS ITS OWN COPY, at `player/<map>/`, so promoting Provincetown changes no byte any
 * other town serves. The player is still ONE product — the copies are the same build, pinned at
 * different moments.
 *
 * ⛔ REFUSES, BY NAME: a staged player not built for a runtime slab base (it would read STAGING's
 * slab on a town's domain) · a manifest that does not match its stamp · a build that does not
 * carry this look · any byte that does not match the manifest.
 *
 * Sibling: `publish-player-to-staging.mjs` writes what this reads. Caller: `cartograph/serve.js`
 * POST /looks/<id>/promote. ⛔ Like its siblings, it holds no list of towns.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const STAGED = 'staging/player/'
const CONC = Number(process.env.SITE_UPLOAD_CONC) || 8
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || null
const map = arg('map'), look = arg('look')
const dryRun = process.argv.includes('--dry-run')
const MAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const md5 = (buf) => createHash('md5').update(buf).digest('hex')

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff',
  ttf: 'font/ttf', glb: 'model/gltf-binary', ktx2: 'image/ktx2', bin: 'application/octet-stream',
  wasm: 'application/wasm', txt: 'text/plain; charset=utf-8', map: 'application/json',
}
const typeOf = (rel) => MIME[(rel.split('.').pop() || '').toLowerCase()] || 'application/octet-stream'
// Same rule as the staging publish: hashed assets are immutable, HTML never cached.
const cacheOf = (rel) => /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\./.test(rel) ? 'public, max-age=31536000, immutable'
  : rel.endsWith('.html') ? 'no-cache' : 'public, max-age=3600'

// Connections to the asset host are refused, reset or time out intermittently (measured 2026-09-27, from a plain
// shell: one in several runs died on its first GET). Those, and only those, are retried. An HTTP status is an answer
// and is never retried; nor is a byte mismatch (checked by the caller).
const TRANSIENT = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'])
const TRIES = 5

async function getBytes(key) {
  for (let i = 1; ; i++) {
    let r
    try {
      r = await fetch(PUBLIC_BASE + key, { cache: 'no-store' })
      if (!r.ok) throw new Error(`${key} → HTTP ${r.status}`)
      return Buffer.from(await r.arrayBuffer())
    } catch (e) {
      const code = e.cause?.code
      if (r?.ok === false || !TRANSIENT.has(code)) throw e
      if (i === TRIES) throw new Error(`${PUBLIC_BASE + key}: ${code} on all ${TRIES} tries — the asset host would not connect`)
      await new Promise((ok) => setTimeout(ok, 500 * 2 ** (i - 1)))
    }
  }
}

function putBytes(key, buf, rel) {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--pipe', '--remote',
      '--content-type', typeOf(rel), '--cache-control', cacheOf(rel)], { cwd: REPO_ROOT })
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('error', reject)
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`put ${key} exited ${code}: ${err.trim()}`)))
    p.stdin.end(buf)
  })
}
async function put(key, buf, rel) {
  let last
  for (let i = 0; i < 3; i++) {
    try { return await putBytes(key, buf, rel) } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * 2 ** i)) }
  }
  throw new Error(`put failed after 3 attempts: ${key}\n${last?.message}`)
}

;(async () => {
  if (!MAP_ID.test(map || '') || !MAP_ID.test(look || '')) throw new Error('--map=<map> and --look=<look> are both required')
  const dest = `player/${map}/`

  // ── 1. WHICH build. The stamp names it; the manifest must be the stamp's.
  const stampBuf = await getBytes(`${STAGED}build.json`)
  const stamp = JSON.parse(stampBuf)
  if (stamp.assetBase !== 'runtime') {
    throw new Error(`the staged player (built ${stamp.builtAt ?? '?'}) has its slab address compiled in — it would read `
      + 'STAGING\'s slab on a town\'s domain. Publish to Staging again so it is rebuilt for a runtime base.')
  }
  const manBuf = await getBytes(`${STAGED}manifest.json`)
  if (md5(manBuf) !== stamp.manifestMd5) {
    throw new Error('staging/player/manifest.json is not the one build.json names — a publish is mid-flight or '
      + 'failed. Publish to Staging again, then promote.')
  }
  const manifest = JSON.parse(manBuf)
  const rels = new Set(manifest.files.map((f) => f.rel))
  for (const need of ['index.html', `looks/${look}/design.json`]) {
    if (!rels.has(need)) throw new Error(`the staged player has no "${need}" — it cannot serve look "${look}". Publish it to staging first.`)
  }
  console.log(`build    ${stamp.builtAt} · ${manifest.files.length} files → ${BUCKET}/${dest}`)

  // ── 2. WHAT is already pinned. ⛔ Every uncertain answer copies (same rule as the uploaders).
  const pending = []
  const queue = [...manifest.files]
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let f = queue.pop(); f; f = queue.pop()) {
      try {
        const r = await fetch(PUBLIC_BASE + dest + f.rel, { method: 'HEAD', cache: 'no-store' })
        if (r.ok && (r.headers.get('etag') || '').replace(/"/g, '') === f.md5) continue
      } catch { /* copy it */ }
      pending.push(f)
    }
  }))
  console.log(`copy     ${pending.length} files (${manifest.files.length - pending.length} already pinned)`)
  if (dryRun) { console.log('\n--dry-run: nothing copied.'); return }

  // ── 3. COPY, each byte checked against the manifest before it is written.
  let done = 0
  const work = [...pending]
  await Promise.all(Array.from({ length: CONC }, async () => {
    for (let f = work.pop(); f; f = work.pop()) {
      const buf = await getBytes(STAGED + f.rel)
      if (md5(buf) !== f.md5) {
        throw new Error(`staging/player/${f.rel} does not match the manifest — the staged build changed under this `
          + 'promote. Nothing is switched; promote again.')
      }
      await put(dest + f.rel, buf, f.rel)
      if (++done % 25 === 0) console.log(`         ${done}/${pending.length}`)
    }
  }))

  // ── 4. The pinned copy's own manifest and stamp, LAST: they say "this copy is complete".
  await put(`${dest}manifest.json`, manBuf, 'manifest.json')
  await put(`${dest}build.json`, stampBuf, 'build.json')
  console.log(`\n✅ player ${stamp.builtAt} pinned for ${map}`)
  console.log(JSON.stringify({ ok: true, map, look, builtAt: stamp.builtAt, copied: pending.length }))
})().catch((e) => { console.error('\n⛔ promote-player FAILED:', e.message, e.cause?.code ? `(${e.cause.code})` : ''); process.exit(1) })
