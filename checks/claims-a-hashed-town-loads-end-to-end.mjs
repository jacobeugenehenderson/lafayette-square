#!/usr/bin/env node
/**
 * "DOES THE PUBLISHED PLAYER DRAW A CONTENT-NAMED TOWN — ASKING FOR NOTHING BUT CONTENT NAMES?"
 *
 * WHY (BRIEF-slab-loading §3 step 3, 2026-09-28). The resolver, the uploader and the Workers can
 * each be right alone and still disagree. This runs the REAL published player (a
 * `VITE_ASSET_BASE=runtime` build, as staging serves it) against a town laid out EXACTLY as a
 * content-named upload leaves it in R2 — manifest.json stamped `names: sha256-16`, every other
 * file only at `<name>.<sha16>.<ext>` — without R2 and without a server: headless Chrome, a
 * throwaway profile, every request answered by interception (`Fetch.fulfillRequest`).
 *
 *   https://ward.test/<town>/        → the player's index.html + <meta name="ward-asset-base">
 *   https://ward.test/_player/…      → the build (else public/, as the site serves its own assets)
 *   https://slab.test/staging/baked/<town>/manifest.json → the town's manifest, stamped
 *   https://slab.test/staging/baked/<town>/<content name> → that file's bytes
 *   anything else under slab.test/…/baked/ → 404, RECORDED — a plain name asked of a hashed town is the defect
 *   any non-GET                     → blocked (a throwaway profile sends nothing), listed
 *
 * Asserts: content-named files were served; ZERO plain-name slab requests; zero uncaught page
 * exceptions. Requests outside baked/ (live/, setpieces/) and non-GETs are listed, not judged. Writes a screenshot beside the build for the eye.
 *
 * ⛔ READ-ONLY (writes a temp build + profile). Usage:
 *   node checks/claims-a-hashed-town-loads-end-to-end.mjs [--town=huron] [--dist=<a runtime build>]
 * Without --dist it builds one (public/ excluded — it is served from disk by interception).
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { HASHED, contentName } from '../src/lib/slabNames.js'

const ROOT = new URL('..', import.meta.url).pathname
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const TOWN = arg('town') || 'huron'
// --names=plain lays the town out as it is in R2 TODAY (plain names, unstamped manifest): the
// before/after comparison, and the proof that a resolver player still draws a town not yet re-uploaded.
const PLAIN = arg('names') === 'plain'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let DIST = arg('dist')
if (!DIST) {
  DIST = mkdtempSync(join(tmpdir(), 'hashed-player-'))
  const cfg = join(DIST, 'vite.config.mjs')
  writeFileSync(cfg, `import base from '${ROOT}vite.config.js'
export default async (env) => { const c = typeof base === 'function' ? await base(env) : base
  return { ...c, root: '${ROOT}', publicDir: false, build: { ...(c.build || {}), outDir: '${DIST}/dist', emptyOutDir: true } } }\n`)
  console.log(`building the runtime player into ${DIST}/dist …`)
  execFileSync('npx', ['vite', 'build', '--config', cfg, '--base=/_player/'], { cwd: ROOT, env: { ...process.env, VITE_ASSET_BASE: 'runtime' }, stdio: 'ignore' })
  DIST = join(DIST, 'dist')
}

// ── the town, as a content-named upload leaves it ────────────────────────────────────
const townDir = join(ROOT, 'public/baked', TOWN)
const manifest = JSON.parse(readFileSync(join(townDir, 'manifest.json'), 'utf8'))
const stamped = Buffer.from(JSON.stringify(PLAIN ? manifest : { ...manifest, names: HASHED }))
const byName = new Map()   // content name → abs
for (const [rel, f] of Object.entries(manifest.files || {})) byName.set(contentName(rel, f.sha256), join(townDir, rel))
for (const [n, c] of Object.entries(manifest.content || {})) if (c) byName.set(contentName('content/' + n, c.sha256), join(townDir, 'content', n))
for (const p of Object.values(manifest.photos || {})) if (p) byName.set(contentName(p.path, p.sha256), join(townDir, p.path))

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm', '.webp': 'image/webp', '.woff2': 'font/woff2' }
const SLAB = 'https://slab.test/staging/'
const served = { hashed: 0, bytes: 0, rels: new Set() }, plainAsks = [], slab404 = [], nonGet = [], exceptions = []

function answer(url) {
  const u = new URL(url)
  if (u.host === 'ward.test') {
    if (!u.pathname.startsWith('/_player/')) {
      const html = readFileSync(join(DIST, 'index.html'), 'utf8')
        .replace('<head>', `<head><meta name="ward-asset-base" content="${SLAB}" />`)
      return { status: 200, type: 'text/html', body: Buffer.from(html) }
    }
    const rel = decodeURIComponent(u.pathname.slice('/_player/'.length))
    for (const base of [DIST, join(ROOT, 'public')]) {
      const f = join(base, rel)
      if (existsSync(f) && statSync(f).isFile()) return { status: 200, type: MIME[extname(f)] || 'application/octet-stream', body: readFileSync(f) }
    }
    return { status: 404, type: 'text/plain', body: Buffer.from('not found') }
  }
  if (u.host === 'slab.test') {
    const p = u.pathname.replace(/^\/staging\//, '')
    const pre = `baked/${TOWN}/`
    if (p === pre + 'manifest.json') return { status: 200, type: 'application/json', body: stamped }
    if (PLAIN && p.startsWith(pre) && existsSync(join(townDir, p.slice(pre.length))) && statSync(join(townDir, p.slice(pre.length))).isFile()) {
      const body = readFileSync(join(townDir, p.slice(pre.length)))
      served.rels.add(p.slice(pre.length)); served.hashed++; served.bytes += body.length
      return { status: 200, type: MIME[extname(p)] || 'application/octet-stream', body }
    }
    if (!PLAIN && p.startsWith(pre) && byName.has(p.slice(pre.length))) {
      const body = readFileSync(byName.get(p.slice(pre.length)))
      served.rels.add(byName.get(p.slice(pre.length)).slice(townDir.length + 1)); served.hashed++; served.bytes += body.length
      return { status: 200, type: MIME[extname(p)] || 'application/octet-stream', body }
    }
    if (p.startsWith('baked/')) plainAsks.push(p + u.search)
    else slab404.push(p)
    return { status: 404, type: 'text/plain', body: Buffer.from('not in a content-named town') }
  }
  return null   // other origins (fonts, CDNs): let the GET through
}

const profile = mkdtempSync(join(tmpdir(), 'hashed-town-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--use-angle=metal', '--enable-unsafe-swiftshader', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0] || m.params.exceptionDetails?.text)
  if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params
    if (request.method !== 'GET') { nonGet.push(`${request.method} ${request.url}`); cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, m.sessionId).catch(() => {}); return }
    const a = answer(request.url)
    if (!a) { cdp('Fetch.continueRequest', { requestId }, m.sessionId).catch(() => {}); return }
    cdp('Fetch.fulfillRequest', { requestId, responseCode: a.status, body: a.body.toString('base64'),
      responseHeaders: [{ name: 'content-type', value: a.type }, { name: 'access-control-allow-origin', value: '*' }] }, m.sessionId).catch(() => {})
  }
}

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, S)
await cdp('Runtime.enable', {}, S); await cdp('Page.enable', {}, S)
await cdp('Page.navigate', { url: `https://ward.test/${TOWN}/` }, S)
await sleep(Number(arg('wait') || 45000))
const shot = await cdp('Page.captureScreenshot', { format: 'png' }, S)
const png = join(DIST, '..', `${PLAIN ? 'plain' : 'hashed'}-${TOWN}.png`)
writeFileSync(png, Buffer.from(shot.data, 'base64'))
writeFileSync(png.replace(/\.png$/, '.served.json'), JSON.stringify([...served.rels].sort(), null, 1))
ws.close(); cleanup()

const fails = []
if (!served.hashed) fails.push(`no ${PLAIN ? 'slab' : 'content-named'} file was served — the player never asked for one`)
if (plainAsks.length) fails.push(PLAIN ? `${plainAsks.length} slab request(s) 404'd: ${[...new Set(plainAsks)].slice(0, 8).join(' · ')}` : `${plainAsks.length} slab request(s) by PLAIN name: ${[...new Set(plainAsks)].slice(0, 8).join(' · ')}`)
// Outside the slab (live/, setpieces/) and non-GETs (the old player's backend) are not this check's
// subject; they are said, not failed — a throwaway profile sends nothing anywhere.
if (slab404.length) console.log(`ⓘ ${slab404.length} non-slab request(s) under the asset base not served here: ${[...new Set(slab404)].slice(0, 5).join(' · ')}`)
if (nonGet.length) console.log(`ⓘ ${nonGet.length} non-GET request(s) blocked (throwaway profile): ${[...new Set(nonGet.map(x => x.split('?')[0]))].slice(0, 3).join(' · ')}`)
if (exceptions.length) fails.push(`${exceptions.length} uncaught exception(s): ${[...new Set(exceptions)].slice(0, 4).join(' · ')}`)
console.log(`served ${served.hashed} ${PLAIN ? 'plain-named' : 'content-named'} files (${(served.bytes / 1e6).toFixed(1)} MB) · screenshot ${png}`)
if (fails.length) { console.error(`⛔ ${fails.length} failure(s):`); for (const f of fails) console.error('   ' + f); process.exit(1) }
console.log(PLAIN ? `✅ the published player draws "${TOWN}" from its plain names (the town before its first content-named upload)`
  : `✅ the published player draws "${TOWN}" from content names alone`)
