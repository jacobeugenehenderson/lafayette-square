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
import { readdirSync, statSync, existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
const md5Of = (abs) => createHash('md5').update(readFileSync(abs)).digest('hex')

/**
 * The newest mtime anywhere under the player's sources. ⛔ Recursive: a directory's own
 * mtime does not move when a file in a SUBdirectory changes, and reading it instead is
 * exactly the bug that made the Publish button skip a rebuild after four files under
 * `src/` had changed (2026-09-21). ⛔ Unreadable ⇒ Infinity ⇒ always stale.
 * ⚠️ Keep the input list in step with `serve.js`'s `playerInputs`; they answer the same
 * question from the two ends and a drift between them is a button that lies.
 */
const PLAYER_SRC = ['src', 'index.html', 'vite.config.js', 'package.json']
function newestSrcMtime() {
  const walk = (p) => {
    let st
    try { st = statSync(p) } catch { return Infinity }
    if (!st.isDirectory()) return st.mtimeMs
    let max = st.mtimeMs
    for (const e of readdirSync(p)) { const m = walk(join(p, e)); if (m > max) max = m }
    return max
  }
  return Math.max(...PLAYER_SRC.map((p) => walk(join(REPO_ROOT, p))))
}

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
    // ⛔⛔ THE SLAB BASE IS DECIDED BY THE SITE, NOT THE BUILD (2026-09-26). The player is built
    // with `VITE_ASSET_BASE=runtime` and reads its slab address from the page's
    // `<meta name="ward-asset-base">` — staging's Worker names the staging keys, a town's
    // production Worker names its own domain. That is what lets Promote ship THESE bytes, the
    // ones checked on staging, rather than a second build nobody looked at.
    // ⛔ It keeps `staging.yml`'s doctrine rather than dropping it: a runtime build served with no
    // tag THROWS (`src/lib/bakedUrl.js#runtimeBase`) — it never guesses an environment.
    // ⛔ This used to compile `…/staging/` in and refuse anything else; that guard now lives in
    // the staging Worker's `SLAB_BASE`, which is the only thing that says "staging" to the page.
    const assetBase = 'runtime'
    const probe = await fetch('https://staging.theward.online/_slab-base', { cache: 'no-store' }).catch((e) => ({ ok: false, status: e.message }))
    const said = probe.ok ? (await probe.text()).trim() : null
    if (!said || !/\/staging\/$/.test(said)) {
      throw new Error(`the staging Worker does not tell pages where the slab is (/_slab-base → ${said ?? probe.status}). `
        + 'A runtime player served by it would refuse to load for EVERY town. Deploy workers/staging-sites first.')
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
  if (!pending.length) console.log('already current — no player file changed')

  let done = 0
  const queue = [...pending]
  await Promise.all(Array.from({ length: CONC }, async () => {
    for (let f = queue.pop(); f; f = queue.pop()) {
      await put(f)
      if (++done % 25 === 0) console.log(`         ${done}/${pending.length}`)
    }
  }))

  // ⭐ THE SHARE CARD, per town, for crawlers that never run JavaScript (SMS/iMessage/social).
  // The worker serves ONE index.html whose static tags are Lafayette Square's; it rewrites
  // them per <map> from this file. ⛔ Generated from the instance REGISTRY — never a list
  // here — so a town with a module gets its own card and a town without one gets neutral
  // tags from the worker, never LS's.
  const { registeredMaps, instanceForMap } = await import(join(REPO_ROOT, 'src', 'instances', 'registry.js'))
  const { titleOf } = await import(join(REPO_ROOT, 'src', 'lib', 'townRecord.js'))
  const towns = {}
  for (const m of registeredMaps()) {
    const t = instanceForMap(m), b = t.branding || {}
    towns[m] = { title: titleOf(t), description: t.profile?.tagline || null,
      ogImage: b.ogImage || null, faviconUrl: b.faviconUrl || null, mark: b.mark || null, markSvg: b.markSvg || null }
  }
  const townsTmp = join(DIST, 'towns.json')
  writeFileSync(townsTmp, JSON.stringify(towns, null, 2))
  await put({ abs: townsTmp, rel: 'towns.json' })
  console.log(`towns    towns.json · ${Object.keys(towns).join(', ')}`)

  // ⭐⭐ THE MANIFEST — every byte of THIS build, by name and MD5. Promote copies a town's pinned
  // production player from exactly this list and checks each object against it
  // (`scripts/promote-player-to-prod.mjs`), so what reaches a town's domain is what was checked
  // here — never "whatever staging/player/ holds by then", which a later publish could change.
  // ⛔ Written AFTER every file it names is up, and before the stamp, so a manifest never names a
  // file the bucket does not have.
  const manifest = { builtAt: new Date().toISOString(), assetBase: 'runtime',
    files: [...files.map((f) => f.abs), townsTmp].map((abs) => ({
      rel: relative(DIST, abs).split('\\').join('/'), bytes: statSync(abs).size, md5: md5Of(abs) })) }
  const manTmp = join(DIST, 'manifest.json')
  writeFileSync(manTmp, JSON.stringify(manifest))
  await put({ abs: manTmp, rel: 'manifest.json' })
  console.log(`manifest manifest.json · ${manifest.files.length} files`)

  // ⛔⛔ STAMP WHAT WAS BUILT, IN THE BUCKET — the panel cannot otherwise know. LAST, because it
  // is what says "this build is complete".
  // The Publish row answers "is the site showing my work?" by comparing the live slab's
  // `bakedAt` to the local one. That measures the MAP DATA and says nothing about the
  // player, so a code-only publish left the button present-tense forever and the operator
  // with no way to tell whether staging had their fix. This marker is the missing half:
  // the newest source mtime the published build was made from, written where the site is,
  // so the answer is read off the artifact rather than remembered by this machine.
  // ⭐ `builtAt` is shared with the manifest: it is the build's NAME, and Promote carries it.
  const marker = { builtAt: manifest.builtAt, srcMtimeMs: newestSrcMtime(), files: files.length,
    assetBase: 'runtime', manifestMd5: md5Of(manTmp) }
  const tmp = join(DIST, 'build.json')
  writeFileSync(tmp, JSON.stringify(marker, null, 2))
  await put({ abs: tmp, rel: 'build.json' })
  console.log(`stamp    build.json · srcMtime ${new Date(marker.srcMtimeMs).toISOString()}`)

  console.log(`\n✅ player published — every town at https://staging.theward.online/<map>/`)
})().catch((e) => { console.error('\n⛔ publish FAILED:', e.message); process.exit(1) })
