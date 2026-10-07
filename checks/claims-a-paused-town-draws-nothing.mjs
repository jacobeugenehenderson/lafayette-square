#!/usr/bin/env node
/**
 * "DOES A PAUSED <Town> DRAW NOTHING — AND COME BACK?"
 *
 * WHY (Quire, 2026-09-28). The Ward hoists ONE persistent <Town> and covers it with full pages (Place, ◉, the
 * Bulletin), passing `paused`. Town's own contract says paused "draws no frames" (its frame limiter stops
 * invalidating); and Town warns that a canvas which draws nothing may lose its WebGL surface. Both need measuring.
 *
 * RUNTIME: headless Chrome, a throwaway profile (non-GETs refused), the running dev server; Preview with
 * ?frameloop=demand (the Ward's loop), its inspection probe (window.__townProbe.setPaused).
 * Asserts, over 60 s paused: nothing ASKS for frames on a clock — ≤ 2 invalidates (a data change landing, such as
 * the weather poll, may repaint once; one frame is ~a dozen renderer passes); the WebGL context not lost; frames
 * resume on unpause. (Before 2026-09-28 the clock and sky tickers fed a demand loop from inside it: 792 invalidates,
 * 9,504 renderer passes a minute behind a full page.)
 * On a red, it NAMES who kept asking for frames: R3F's invalidate is traced while paused.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-a-paused-town-draws-nothing.mjs --town=<town> [--base=http://localhost:5173]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requiredTown } from './_scenes.mjs'

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const TOWN = requiredTown('town')
const BASE = arg('base') || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const profile = mkdtempSync(join(tmpdir(), 'shot-flight-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, S)
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method !== 'Fetch.requestPaused') return
  // ⛔ A throwaway profile sends nothing: every non-GET is refused.
  if (m.params.request.method !== 'GET' && m.params.request.method !== 'HEAD') cdp('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }, m.sessionId).catch(() => {})
  else cdp('Fetch.continueRequest', { requestId: m.params.requestId }, m.sessionId).catch(() => {})
})
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S)).result?.value


const fails = []
const done = (code) => { ws.close(); cleanup(); process.exit(code) }
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}&frameloop=demand` }, S)
let ready = false
for (let i = 0; i < 90 && !ready; i++) { await sleep(1000); ready = await js('!!(window.__townProbe && window.__flight?.current?.landed && window.__renderer && window.__scene?.__r3f?.root)') }
if (!ready) { console.error('⛔ the Preview never offered its probe, renderer and R3F root — nothing to measure'); done(1) }
await sleep(4000)
const loop = await js(`(() => { const root = window.__scene.__r3f.root, st = root.getState(); window.__inv = new Map(); window.__invOn = false
  const orig = st.invalidate
  root.setState({ invalidate: (...a) => { if (window.__invOn) { const k = (new Error().stack || '').split('\\n').slice(2, 5).map(l => l.trim().replace(/\\(?https?:\\/\\/[^/]+\\/(src|node_modules\\/\\.vite\\/deps)\\//, '').replace(/\\?[^:)]*/, '')).join(' < '); window.__inv.set(k, (window.__inv.get(k) || 0) + 1); (window.__invAt = window.__invAt || []).push(Math.round(performance.now() / 100) / 10) } return orig(...a) } })
  return st.frameloop })()`)
if (loop !== 'demand') fails.push(`the canvas runs frameloop "${loop}" — ?frameloop=demand did not take`)
await js('window.__townProbe.setPaused(true)')
await sleep(2000)
await js('window.__invOn = true')
const f0 = await js('window.__renderer.info.render.frame')
await sleep(60000)
const f1 = await js('window.__renderer.info.render.frame')
const lost = await js('window.__renderer.getContext().isContextLost()')
await js('window.__invOn = false')
const who = await js('JSON.stringify([...window.__inv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5))').then(JSON.parse)
await js('window.__townProbe.setPaused(false)')
await sleep(1500)
const f2 = await js('window.__renderer.info.render.frame')
console.log(`  paused 60 s: ${who.reduce((a, [, n]) => a + n, 0)} frame request(s), ${f1 - f0} renderer passes · context ${lost ? 'LOST' : 'kept'} · ${f2 - f1} frames in 1.5 s after`)
if (lost) fails.push('60 s paused LOST the WebGL context')
const asked = who.reduce((a, [, n]) => a + n, 0)
if (asked > 2) {
  fails.push(`paused, the town asked for ${asked} frames in 60 s (${f1 - f0} renderer passes) — nothing should ask on a clock`)
  console.log('  who asked for frames while paused (R3F invalidate, top callers):')
  for (const [k, n] of who) console.log(`    ${String(n).padStart(5)} × ${k}`)
  console.log(`    first requests at (s): ${(await js('JSON.stringify((window.__invAt || []).slice(0, 12))'))}`)
}
if (f2 <= f1) fails.push(`frames did not resume after the pause (${f1} → ${f2})`)
if (fails.length) { console.error(`⛔ ${fails.length} failure(s):`); for (const f of fails) console.error('   ' + f); done(1) }
console.log('✅ a paused town draws nothing, keeps its context, and comes back')
done(0)
