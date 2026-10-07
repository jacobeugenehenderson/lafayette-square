#!/usr/bin/env node
/**
 * "DOES SCRUBBING THE HERO TIMELINE EVER WRITE THE KEYFRAMES?"
 *
 * WHY (Jacob, 2026-09-28: "I was trying to edit the time slider and the keyframe moved"). The key dots sit ON the
 * scrub track; a press that landed on a dot and moved RETIMED that key and autosaved design.json. Ruled: a plain drag
 * from a dot scrubs like the rest of the track; ⌥-drag (Alt) retimes.
 *
 * A RUNTIME check: headless Chrome (a throwaway profile) drives Stage's Camera card on the running dev server, with
 * EVERY non-GET request intercepted and FAILED — nothing can be saved. It asserts that scrubbing the bare track, a
 * drag starting on every key dot (both ways) and a click on every dot leave heroKeyframes unchanged AND attempt no
 * design save; and that an ⌥-drag on a middle key DOES retime it (so the check can tell the two apart).
 * ⛔ It reads what the dev server SERVES (the main tree). Needs a town whose hero path has ≥ 2 keys.
 *
 * Usage: node checks/claims-a-scrub-never-writes-the-keys.mjs --look=<town>
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requiredTown } from './_scenes.mjs'
const look = requiredTown('look')
const BASE = 'http://localhost:5173'
const profile = mkdtempSync(join(tmpdir(), 'hero-scrub-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1400,900', '--enable-gpu', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map(); const saves = []; const errors = []
let S
const cdp = (method, params = {}, sessionId = S) => new Promise((res, rej) => { const id = ++seq; pending.set(id, m => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
ws.onmessage = async (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Fetch.requestPaused') {
    const r = m.params.request
    if (r.method !== 'GET') {
      let kf = null; try { kf = JSON.parse(r.postData || '{}').heroKeyframes } catch {}
      saves.push({ url: r.url.replace(BASE, ''), at: Date.now(), keys: Array.isArray(kf) ? kf.map(k => k.t) : kf })
      cdp('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {})
    } else cdp('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => {})
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200))
}
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' }, null)
S = (await cdp('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
await cdp('Runtime.enable'); await cdp('Page.enable')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
// ?scene= — `?look=` alone is overridden by the scene's default in a fresh profile (measured 2026-09-28: ?look=huron
// opened Lafayette Square). The town actually loaded is asserted below.
await cdp('Page.navigate', { url: `${BASE}/cartograph.html?scene=${look}` })
await sleep(25000)
const ev = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value
const STORE = `(await import(performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('/stores/useCartographStore.js')).pop())).default`
const keys = async () => ev(`(async () => (${STORE}).getState().heroKeyframes.map(k => k.t))()`)
const log = async (what) => console.log(`${what.padEnd(46)} store keys ${JSON.stringify(await keys())}  saves so far ${saves.length}`)
await log('loaded (Designer)')
const loaded = await ev(`(async () => (${STORE}).getState().activeLookId)()`)
if (loaded !== look) { console.log(`⛔ CANNOT RUN — asked for "${look}", Stage loaded "${loaded}"`); process.exit(2) }
await ev(`(async () => { (${STORE}).getState().setShot('hero') })()`); await sleep(8000)
await log('shot → hero')
// Open the Camera card (a Collapsible: a button whose text ends with the label).
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Camera$/.test(b.textContent.trim())); b?.click(); return !!b })()`)
await sleep(3000)
await log('Camera card opened')
const readTracks = () => ev(`(() => [...document.querySelectorAll('div')].filter(d => d.className?.includes?.('touch-none') && d.className.includes('h-6')).map(t => { const r = t.getBoundingClientRect(); const m = [...t.children].filter(c => c.title && !/again/.test(c.title)).map(c => { const b = c.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2] }); return { x: r.x, y: r.y + r.height / 2, w: r.width, markers: m } }))()`)
const tracks = await readTracks()
const track = tracks.find(t => t.markers.length > 1)
if (!track) { console.log(`⛔ CANNOT RUN — no hero timeline with ≥ 2 keys on "${look}" (the check needs a key to drag); tracks seen: ${JSON.stringify(tracks)}; buttons: ${await ev(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 60).join(' | ')`)}; body text: ${JSON.stringify(await ev('document.body.innerText.slice(0, 300)'))}; exceptions: ${JSON.stringify(errors.slice(0, 4))}`); process.exit(2) }
const mouse = (type, x, y, mod = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, modifiers: mod, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' })
const drag = async (x0, x1, y, mod = 0) => { await mouse('mousePressed', x0, y, mod); for (let i = 1; i <= 20; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / 20, y, mod); await sleep(30) } await mouse('mouseReleased', x1, y, mod); await sleep(800) }
const fails = []
// Each gesture is judged against the state just before it, so one retime does not fail every later line.
let before = JSON.stringify(await keys()), savesBefore = 0
const same = async (what) => { const now = JSON.stringify(await keys()); const n = saves.filter(s => s.url.includes('/design')).length - savesBefore
  if (now !== before || n) fails.push(`${what}: keys ${before} → ${now}, ${n} design save(s) attempted`)
  console.log(`${now === before && !n ? '✅' : '⛔'} ${what}`)
  before = now; savesBefore += n }
const start = before
await drag(track.x + 2, track.x + track.w - 2, track.y); await same('scrub the bare track →')
await drag(track.x + track.w - 2, track.x + 2, track.y); await same('scrub the bare track ←')
// Dot positions are re-read before every gesture: a retime moves them.
const dot = async (i) => (await readTracks()).find(t => t.markers.length > 1).markers[i]
for (let i = 0; i < track.markers.length; i++) {
  let [mx, my] = await dot(i)
  await drag(mx, mx + track.w * 0.25, my); await same(`a drag that starts on key ${i + 1}'s dot →`)
  ;[mx, my] = await dot(i)
  await drag(mx, mx - track.w * 0.25, my); await same(`a drag that starts on key ${i + 1}'s dot ←`)
  ;[mx, my] = await dot(i)
  await mouse('mousePressed', mx, my); await mouse('mouseReleased', mx, my); await sleep(600); await same(`a click on key ${i + 1}'s dot`)
}
// ⭐ Not blind: ⌥-drag on a middle key DOES retime it (and would save — the save is blocked).
const [mx, my] = await dot(1)
const pre = JSON.stringify(await keys())
await drag(mx, mx + track.w * 0.08, my, 1 /* Alt */)
const after = JSON.stringify(await keys())
if (after === pre) fails.push(`⌥-drag on key 2 did NOT retime it (${pre}) — the check cannot tell a retime from a scrub`)
console.log(`${after !== pre ? '✅' : '⛔'} ⌥-drag on key 2 retimes it: ${pre} → ${after}`)
if (errors.length) console.log('exceptions:', errors.slice(0, 3))
ws.close(); cleanup()
if (fails.length) { console.log(`\n⛔ FAIL — ${fails.length}\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log('\n✅ scrubbing never writes the keys; ⌥-drag is the only retime')
process.exit(0)
