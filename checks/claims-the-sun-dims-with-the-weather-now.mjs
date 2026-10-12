#!/usr/bin/env node
/**
 * "DOES THE SUN DIM WITH THE WEATHER IT IS IN — OR THE ONE BEFORE?"
 *
 * WHY (Vesper, 2026-10-12; ROADMAP board line). CelestialBodies dims the sun and moon by cloud cover
 * (`intensity × (1 − cloudCover × 0.6)`) and lifts the fills by it. The weather's numbers are published by
 * AtmosphereDirectiveDriver in the frame loop (useSkyState.cloudCover / storminess); if CelestialBodies reads them
 * only when it happens to render, a weather change that lands after that render leaves the light on the OLD
 * weather until something else re-renders it — a scrub, a capture, a weather switch with the clock stopped.
 *
 * RUNTIME: headless Chrome, a throwaway profile (non-GETs refused), the running dev server; Stage
 * (`/stage/<town>/browse`), its R3F handle (window.__r3f), the stores by module import. The clock is paused, so
 * nothing but the weather moves. Asserts, for Clear → Overcast → Clear (Stage's Weather switch, which snaps):
 *   once the published cloud cover has landed and a few frames are drawn, both body lights (the casting key and
 *   the counter) stand at their Clear intensity × (1 − cc × 0.6) / (1 − cc₀ × 0.6), cc as CelestialBodies rounds it.
 * A stale read is red, naming the light, the cloud cover and the two intensities. Seen red 2026-10-12 on huron
 * against the render-time getState() read: Overcast's key stood at ×1.000 of Clear's (wants ×0.489), and Clear then
 * at ×0.489, so each weather wore the PREVIOUS one's dimming. Green on the subscription.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-the-sun-dims-with-the-weather-now.mjs --town=<town> [--base=http://localhost:5173]
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

const profile = mkdtempSync(join(tmpdir(), 'sun-weather-'))
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
const js = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S)
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result?.value
}
const done = (code) => { ws.close(); cleanup(); process.exit(code) }

await cdp('Page.navigate', { url: `${BASE}/stage/${TOWN}/browse` }, S)
let ready = false
for (let i = 0; i < 120 && !ready; i++) { await sleep(1000); ready = await js('!!(window.__r3f && window.__r3f.gl.info.render.frame > 30)').catch(() => false) }
if (!ready) { console.error(`⛔ NOT MEASURED — Stage never drew "${TOWN}" (no window.__r3f, or under 30 frames)`); done(2) }

await js(`(async () => {
  // ⭐ IMPORT WHAT THE PAGE IMPORTED: Vite serves a module edited this session as "…?t=<stamp>", and a bare import
  // gets a SECOND, empty store (claims-a-click-hits-what-is-drawn.mjs). Resolve the URL the page loaded.
  const m = (p) => import(performance.getEntriesByType('resource').map((r) => r.name)
    .find((n) => { try { return new URL(n).pathname === p } catch { return false } }) ?? p).then((x) => x.default)
  window.__w = { sky: await m('/src/hooks/useSkyState.js'), tod: await m('/src/hooks/useTimeOfDay.js'),
    cart: await m('/src/cartograph/stores/useCartographStore.js'), atm: await m('/src/hooks/useAtmosphere.js') }
  window.__w.tod.getState().setPaused(true)
  return true })()`)

// Stand the weather (always a CHANGE: an unchanged mode requests no snap), wait for it to land (the snap consumed, the published directive the raw one), then 10 frames.
async function stand(mode) {
  const landed = await js(`(async () => {
    const { cart, atm, sky } = window.__w, gl = window.__r3f.gl
    if (cart.getState().weatherMode === '${mode}') throw new Error('already ${mode}')
    cart.getState().setWeatherMode('${mode}')
    const t0 = performance.now()
    for (;;) {
      await new Promise((r) => requestAnimationFrame(r))
      const a = atm.getState()
      if (sky.getState().feedPaused && !a.snapPending && a.rawDirective && a.tweenedDirective === a.rawDirective) break
      if (performance.now() - t0 > 20000) return JSON.stringify({ pill: document.querySelector('[aria-label="Weather"] [aria-pressed="true"]')?.textContent, mode: cart.getState().weatherMode, feedPaused: sky.getState().feedPaused, snapPending: a.snapPending, raw: !!a.rawDirective, landed: a.tweenedDirective === a.rawDirective, frames: gl.info.render.frame })
    }
    // Ten ANIMATION frames (not renderer passes: one frame is about a dozen of them, post-processing included).
    for (let k = 0; k < 10; k++) await new Promise((r) => requestAnimationFrame(r))
    return true })()`)
  if (landed !== true) { console.error(`⛔ NOT MEASURED — ${mode} weather did not land within 20 s: ${landed}`); done(2) }
  return js(`(() => {
    const s = window.__w.sky.getState(), lights = []
    window.__r3f.scene.traverse((o) => { if (o.isDirectionalLight && o.visible) lights.push({ name: o.castShadow ? 'key (casting)' : 'directional ' + lights.length, i: o.intensity }) })
    return { cc: Math.round((s.cloudCover || 0) * 20) / 20, lights } })()`)
}

const fails = []
// Stage opens on its session's weather (Clear by default): step to Overcast first, so Clear is a change that lands.
if (await js("window.__w.cart.getState().weatherMode") === 'clear') await stand('overcast')
const clear = await stand('clear')
const key = (l) => l.name
for (const mode of ['overcast', 'clear']) {
  const now = await stand(mode)
  const want = (1 - now.cc * 0.6) / (1 - clear.cc * 0.6)
  console.log(`  ${mode}: cloud cover ${now.cc} (Clear ${clear.cc}) → the body lights should stand at ×${want.toFixed(3)}`)
  for (const l of now.lights) {
    const base = clear.lights.find((c) => key(c) === key(l))
    if (!base || base.i < 1e-6) continue
    const got = l.i / base.i
    const line = `${l.name}: ${base.i.toFixed(4)} → ${l.i.toFixed(4)} (×${got.toFixed(3)})`
    if (Math.abs(got - want) < 2e-3) console.log(`    ✅ ${line}`)
    else { console.log(`    ⛔ ${line}`); fails.push(`${mode}: ${l.name} at ×${got.toFixed(3)}, cloud cover ${now.cc} wants ×${want.toFixed(3)}`) }
  }
}
if (clear.cc === 0 && !fails.length) {
  // ⭐ The assertion must be able to fail: Overcast has to have moved the cloud cover at all.
  const o = await stand('overcast'); await stand('clear')
  if (o.cc === 0) fails.push('Overcast published cloud cover 0 — the weather did not change, so this measured nothing')
}
if (fails.length) { console.error(`⛔ ${fails.length} failure(s):`); for (const f of fails) console.error('   ' + f); done(1) }
console.log('✅ the sun and moon dim with the weather they are in, the moment it lands')
done(0)
