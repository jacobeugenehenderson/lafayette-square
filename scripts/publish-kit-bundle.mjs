#!/usr/bin/env node
/**
 * publish-kit-bundle.mjs — put the renderer's OWN files on the asset host, once per kit commit.
 *
 *   node scripts/publish-kit-bundle.mjs [--sha=<kit commit>] [--dry-run]      (default: HEAD)
 *
 * → R2 `staging/kit/<sha>/…`, served at `https://assets.theward.online/staging/kit/<sha>/…`. The
 * staging Worker names that base in `<meta name="ward-kit-base">` for every "ward" town, from the kit
 * sha the Ward's build pins (`staging/ward/current.json`'s `kit`); the renderer's `kitUrl()` reads it.
 * Ruled 2026-09-28, BRIEF-ward-on-staging §4.3 — the renderer's assets are the renderer's
 * (`BRIEF-slab-loading §⑥b`), versioned, on the asset host, pinned by the host page.
 *
 * ⭐ WHAT SHIPS IS READ FROM THE SOURCE, AT THAT COMMIT. Every `kitUrl(` call site under `src/` names its
 *    file with a literal (or a template whose literal prefix is a directory); the bundle is every file
 *    git tracks under `public/` at those names. ⛔ No hand list: a new `kitUrl('x/y')` ships the day it is
 *    written, and a call site with no literal path is refused by name rather than shipped without its file.
 * ⭐ READ FROM GIT, NOT THE WORKING TREE. The bundle for <sha> is exactly <sha>'s bytes, so a dirty tree
 *    cannot leak into it and any commit can be published after the fact.
 * ⭐ IMMUTABLE. Every file is cached for a year; `manifest.json` ({ kit, files: {path: sha256}, from }) is
 *    written LAST, so a half-upload is never a bundle, and a sha whose manifest already answers is not
 *    re-uploaded.
 *
 * Why its own script, not a mode of `publish-player-to-staging.mjs`: that one ships a Vite BUILD of the
 * kit's player to one mutable prefix and is deleted at cutover; this ships source files at a commit to an
 * immutable per-sha prefix, and is how The Ward gets the renderer's files after cutover too.
 */
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const CONC = 8
const IMMUTABLE = 'public, max-age=31536000, immutable'
const MIME = {
  '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.txt': 'text/plain; charset=utf-8',
}
const dryRun = process.argv.includes('--dry-run')
const fail = (why) => { console.error(`⛔ publish-kit-bundle: ${why}`); process.exit(1) }
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 30, ...opts })

let sha
try { sha = git(['rev-parse', '--verify', `${process.argv.find((a) => a.startsWith('--sha='))?.slice(6) || 'HEAD'}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
catch { fail('--sha does not name a commit in this repo') }
const PREFIX = `staging/kit/${sha}/`

// ── 1. What the renderer asks for, at <sha>.
try { git(['cat-file', '-e', `${sha}:src/lib/kitUrl.js`], { stdio: 'ignore' }) }
catch { fail(`${sha.slice(0, 12)} has no src/lib/kitUrl.js — that commit's renderer does not read a kit base, so a bundle would serve nothing`) }
let hits = ''
try { hits = git(['grep', '-n', '-e', 'kitUrl(', sha, '--', 'src'], { encoding: 'utf8' }) } catch { /* no hits → refused below */ }
const wants = new Map()   // path or directory prefix → call sites
const unreadable = []
for (const line of hits.split('\n').filter(Boolean)) {
  const [, file, ln, text] = line.match(/^[0-9a-f]+:([^:]+):(\d+):(.*)$/) || []
  if (!file || file === 'src/lib/kitUrl.js' || /^\s*(\*|\/\/)/.test(text)) continue
  for (const m of text.matchAll(/kitUrl\(\s*(?:'([^']*)'|"([^"]*)"|`([^`$]*)(\$\{)?[^`]*`|([^)]*))/g)) {
    const lit = m[1] ?? m[2] ?? m[3]
    if (lit == null || (m[4] && !lit.endsWith('/'))) { unreadable.push(`${file}:${ln}: ${text.trim()}`); continue }
    const at = `${file}:${ln}`
    wants.set(lit, [...(wants.get(lit) || []), at])
  }
}
if (unreadable.length) fail(`these kitUrl() calls have no literal path (or a template prefix that is not a directory), so the bundle cannot know their file:\n  ${unreadable.join('\n  ')}`)
if (!wants.size) fail(`no kitUrl() call sites under src/ at ${sha.slice(0, 12)}`)

// ── 2. The files git tracks under public/ at those names.
const tracked = git(['ls-tree', '-r', '-l', sha, '--', 'public'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  .map((l) => { const [meta, path] = l.split('\t'); const [, , blob, size] = meta.trim().split(/\s+/); return { blob, size: Number(size), rel: path.slice('public/'.length) } })
const files = new Map()
for (const [want, sites] of wants) {
  const matched = tracked.filter((f) => (want.endsWith('/') ? f.rel.startsWith(want) : f.rel === want))
  if (!matched.length) fail(`kitUrl('${want}') (${sites.join(', ')}) names nothing git tracks under public/ at ${sha.slice(0, 12)}`)
  for (const f of matched) files.set(f.rel, f)
}
const list = [...files.values()].sort((a, b) => a.rel.localeCompare(b.rel))
const bytes = list.reduce((n, f) => n + f.size, 0)

console.log(`kit      ${sha}`)
console.log(`bundle   ${list.length} files, ${(bytes / 1048576).toFixed(1)} MB → ${BUCKET}/${PREFIX}`)
for (const [want, sites] of [...wants].sort()) console.log(`  ${want.padEnd(40)} ← ${sites.join(', ')}`)
for (const f of list) console.log(`    ${f.rel.padEnd(48)} ${(f.size / 1024).toFixed(0).padStart(7)} KB`)
console.log(`base     ${PUBLIC_BASE}${PREFIX}   (the Worker stamps this as ward-kit-base)`)

const published = await fetch(`${PUBLIC_BASE}${PREFIX}manifest.json`, { method: 'HEAD', cache: 'no-store' }).then((r) => r.status).catch((e) => `unreachable (${e.message})`)
if (published === 200) { console.log(`✅ already published — ${PREFIX}manifest.json answers; a kit bundle is immutable, nothing to do`); process.exit(0) }
if (published !== 404) fail(`could not tell whether ${PREFIX} is published: ${published}`)
if (dryRun) { console.log('dry run: nothing uploaded'); process.exit(0) }

// ── 3. Upload from git objects, manifest last.
const STAGE = join(ROOT, 'node_modules/.cache/kit-bundle', sha)
rmSync(STAGE, { recursive: true, force: true })
const manifest = { kit: sha, files: {}, from: Object.fromEntries(wants) }
for (const f of list) {
  const abs = join(STAGE, f.rel)
  mkdirSync(dirname(abs), { recursive: true })
  const buf = git(['cat-file', 'blob', f.blob])
  writeFileSync(abs, buf)
  manifest.files[f.rel] = createHash('sha256').update(buf).digest('hex')
  f.abs = abs
}
async function put(key, abs) {
  const args = ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', abs, '--remote',
    '--content-type', MIME[extname(key).toLowerCase()] || 'application/octet-stream', '--cache-control', IMMUTABLE]
  let last
  for (let i = 0; i < 3; i++) {
    try { return await run('npx', args, { cwd: ROOT, maxBuffer: 1 << 24 }) } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * 2 ** i)) }
  }
  throw new Error(`put failed after 3 attempts: ${key}\n${last?.stderr || last?.message}`)
}
try {
  const queue = [...list]
  await Promise.all(Array.from({ length: CONC }, async () => { for (let f; (f = queue.shift());) await put(PREFIX + f.rel, f.abs) }))
  const mAbs = join(STAGE, 'manifest.json')
  writeFileSync(mAbs, JSON.stringify(manifest, null, 1))
  await put(`${PREFIX}manifest.json`, mAbs)
} catch (e) { fail(e.message) } finally { rmSync(STAGE, { recursive: true, force: true }) }

// ── 4. Ask the host: the manifest, and every file at its size.
const problems = []
await Promise.all(list.concat([{ rel: 'manifest.json' }]).map(async (f) => {
  const r = await fetch(`${PUBLIC_BASE}${PREFIX}${f.rel}`, { method: 'HEAD', cache: 'no-store' }).catch((e) => ({ status: e.message }))
  if (r.status !== 200) problems.push(`${f.rel}: ${r.status}`)
  else if (f.size != null && Number(r.headers.get('content-length')) !== f.size) problems.push(`${f.rel}: ${r.headers.get('content-length')} bytes, want ${f.size}`)
}))
if (problems.length) fail(`uploaded, but the asset host doesn't confirm it:\n  ${problems.join('\n  ')}`)
console.log(`✅ kit bundle ${sha.slice(0, 12)} published — ${PUBLIC_BASE}${PREFIX}`)
