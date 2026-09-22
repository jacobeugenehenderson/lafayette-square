#!/usr/bin/env node
/**
 * publish-player-to-staging.mjs — build THE player, once, and put it where every town reads it.
 *
 *   node scripts/publish-player-to-staging.mjs
 *   node scripts/publish-player-to-staging.mjs --dry-run
 *
 * ⭐⭐ ONE BUILD, EVERY TOWN. The Ward is the universal player; a town is a slab
 * instantiated inside it. So the player is compiled once, uploaded to `staging/player/`,
 * and served at every `staging.theward.online/<map>/` — the app reads its town off the
 * first path segment and fetches that town's slab from R2 at runtime.
 * ⛔ THE FIRST DESIGN WAS A BUILD PER TOWN and it was a category error: N compilations of
 * the thing whose definition is being one thing, plus a build and a ~400 MB upload for
 * every pour. Nothing per-town is compiled now; pouring town #10 uploads a slab and
 * nothing else. ⛔ Do not reintroduce `--map` here.
 *
 * ⛔ `--base=/_player/` IS LOAD-BEARING AND ABSOLUTE. The same index.html is served at
 * `/huron/` and at `/huron/legal`; a relative base would resolve its assets to a
 * different place at each depth.
 *
 * ⛔ IT SHIPS WHAT CI SHIPS, READ FROM GIT — NEVER A HAND LIST. `dist/` on a developer
 * machine contains trees the deploy has never served: `public/baked/` and `public/trees/`
 * are gitignored (the slab is served from R2), and `public/photos/lafayette-square/` is a
 * 972 MB local-only tree. A publish that uploaded those would push a gigabyte nobody
 * fetches, on the first press. `git check-ignore` is the authority, so a new ignore rule
 * is honoured here the day it is written.
 *
 * Sibling: `scripts/upload-baked-to-r2.mjs` ships the SLAB to `staging/baked/<look>/`.
 * Same bucket, same account, same `wrangler`: the player and the towns are two prefixes
 * under one roof, which is the shape `bakedUrl.js` argues for — "pouring town #2 needs no
 * code change and no entry in any table." ⛔ Neither script may grow a list of towns.
 */
import { readdirSync, statSync, existsSync, rmSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const PLAYER_PREFIX = 'staging/player/'
const PLAYER_BASE = '/_player/'
const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const CONC = Number(process.env.SITE_UPLOAD_CONC) || 8
const DIST = join(REPO_ROOT, 'dist')
const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
}
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name)
    if (e.isDirectory()) walk(abs, out)
    else out.push({ abs, rel: relative(DIST, abs).split('\\').join('/'), bytes: statSync(abs).size })
  }
  return out
}

/**
 * Which dist paths would NOT exist in a CI checkout? Ask git what is TRACKED.
 *
 * The rule: a dist file that came from `public/` ships only if its source is tracked;
 * a dist file with no `public/` counterpart is build output and always ships.
 *
 * ⛔ NOT `git check-ignore`, and the reason is on disk: `public/photos/lafayette-square`
 * is a SYMLINK to an external photo archive (which is why that one directory is 972 MB in
 * a build). `check-ignore` refuses any pathspec "beyond a symbolic link" and then dies of
 * EPIPE mid-stream, so the honest-looking version of this function cannot work here.
 * `git ls-files` has no such restriction and answers the same question from the other side.
 *
 * ⭐ It is still READ, never listed: add an ignore rule, or track a new asset, and this
 * honours it on the next publish with no edit here.
 */
function shippable(files) {
  const tracked = new Set(
    execFileSync('git', ['ls-files', '--', 'public'], { cwd: REPO_ROOT, maxBuffer: 1 << 26, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean).map((l) => l.replace(/^public\//, '')))
  const keep = [], dropped = []
  for (const f of files) {
    const fromPublic = existsSync(join(REPO_ROOT, 'public', f.rel))
    ;(!fromPublic || tracked.has(f.rel) ? keep : dropped).push(f)
  }
  return { keep, dropped }
}

async function put({ abs, rel }) {
  const key = PLAYER_PREFIX + rel
  const type = MIME[extname(rel).toLowerCase()] || 'application/octet-stream'
  const cache = /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\./.test(rel)
    ? 'public, max-age=31536000, immutable'
    : rel.endsWith('.html') ? 'no-cache' : 'public, max-age=3600'
  const args = ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`,
    '--file', abs, '--remote', '--content-type', type, '--cache-control', cache]
  let lastErr
  for (let i = 0; i < 3; i++) {
    try { return await execFileAsync('npx', args, { cwd: REPO_ROOT, maxBuffer: 1 << 24 }) }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 400 * 2 ** i)) }
  }
  // ⛔ Fatal, and it names the key. A partially uploaded player that reports success is a
  // partner opening a half-built page with nobody told.
  throw new Error(`put failed after 3 attempts: ${key}\n${lastErr?.stderr || lastErr?.message}`)
}

/** Skip only what is PROVEN identical. ⛔ Every uncertain answer uploads. */
async function alreadyThere(files) {
  const fresh = new Set()
  const queue = [...files]
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let f = queue.pop(); f; f = queue.pop()) {
      try {
        const r = await fetch(PUBLIC_BASE + PLAYER_PREFIX + f.rel, { method: 'HEAD' })
        if (r.ok && Number(r.headers.get('content-length')) === f.bytes) fresh.add(f.rel)
      } catch { /* unreachable ⇒ upload */ }
    }
  }))
  return fresh
}

;(async () => {
  const skipBuild = process.argv.includes('--no-build')
  if (!skipBuild && existsSync(DIST)) rmSync(DIST, { recursive: true, force: true })
  console.log(skipBuild ? 'build    SKIPPED (--no-build) — sizing the dist already on disk'
    : `build    npm run build -- --base=${PLAYER_BASE}`)
  if (!skipBuild) {
    // ⛔⛔ THE SLAB BASE IS NOT OPTIONAL AND HAS NO FALLBACK. Unset, `bakedUrl.js` resolves
    // ASSET_BASE to BASE_URL — here `/_player/` — and the player would look for every
    // town's slab inside the player prefix, where it is deliberately not uploaded. That
    // is `staging.yml`'s own doctrine, which this build replaces and must keep: "an unset
    // variable must instead break staging's slab visibly, because a broken preview is
    // recoverable in a minute and a preview that lies about being a preview is not."
    // ⛔ And it must carry the STAGING prefix: pointing a preview at the production keys
    // is the 2026-09-03 bug that put a pour on lafayette-square.com with no gate.
    const assetBase = process.env.VITE_ASSET_BASE_STAGING || 'https://assets.theward.online/staging/'
    if (!/\/staging\/$/.test(assetBase)) {
      throw new Error(`VITE_ASSET_BASE_STAGING must end in "/staging/" — got "${assetBase}". `
        + 'A preview pointed at the production keys is not a preview.')
    }
    console.log(`slab     ${assetBase}`)
    const { stdout, stderr } = await execFileAsync('npm',
      ['run', 'build', '--', `--base=${PLAYER_BASE}`],
      { cwd: REPO_ROOT, maxBuffer: 1 << 26, env: { ...process.env, VITE_ASSET_BASE: assetBase } })
    console.log(String(stdout || stderr).trim().split('\n').slice(-2).join('\n'))
  }
  if (!existsSync(DIST)) throw new Error('the build produced no dist/ — refusing to publish nothing')

  const all = walk(DIST)
  const { keep: files, dropped } = shippable(all)
  const total = files.reduce((s, f) => s + f.bytes, 0)
  const droppedBytes = dropped.reduce((s, f) => s + f.bytes, 0)
  console.log(`\nship     ${files.length} files, ${mb(total)}`)
  console.log(`skip     ${dropped.length} files, ${mb(droppedBytes)} — untracked under public/, so the `
    + `deploy has never served them`)

  let pending = files
  if (!force) {
    const fresh = await alreadyThere(files)
    pending = files.filter((f) => !fresh.has(f.rel))
    console.log(`already  ${fresh.size} objects identical in R2 — not re-uploaded`)
  }
  console.log(`upload   ${pending.length} files, ${mb(pending.reduce((s, f) => s + f.bytes, 0))} → ${BUCKET}/${PLAYER_PREFIX}`)
  if (dryRun) { console.log('\n--dry-run: nothing uploaded.'); return }
  if (!pending.length) { console.log('\n✅ the published player is already current'); return }

  let done = 0
  const queue = [...pending]
  await Promise.all(Array.from({ length: CONC }, async () => {
    for (let f = queue.pop(); f; f = queue.pop()) {
      await put(f)
      if (++done % 25 === 0) console.log(`         ${done}/${pending.length}`)
    }
  }))
  console.log(`\n✅ player published — every town at https://staging.theward.online/<map>/`)
})().catch((e) => { console.error('\n⛔ publish FAILED:', e.message); process.exit(1) })
