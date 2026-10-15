#!/usr/bin/env node
/**
 * "DOES THE MAP LEAN WITHOUT TURNING, AND DOES A FRAMING MOVE LAND STRAIGHT DOWN?"
 *
 * WHY (BRIEF-ward-browse-noon-and-the-far-trees, tilt; Jacob, 2026-10-14). The town's plan shot leans like a surface
 * (cameraRegimes.js `overhead`): up to PLAN_MAX_LEAN_DEG off straight down, the azimuth pinned behind the heading, so the
 * rose keeps north. Society's moves (arrival, a category, a search, the pin) are the town's own frames and land
 * straight down. Silent failure here is a map that turns under a lean (the rose lying) or a frame left leaning.
 *
 * Asserts, on the running app (Preview, the plan shot), with real input events:
 *   · a vertical right-drag (mouse) and a two-finger vertical drag (touch) lean the view off straight down, never past
 *     PLAN_MAX_LEAN_DEG (read from the source module, never restated);
 *   · a HORIZONTAL right-drag leans nothing and turns nothing; the bearing (Town's bearingRef) holds through every drag;
 *   · after a lean, a framing move (setLitIds + setFrameKey, Society's one move) lands straight down.
 *
 * ⛔ READ-ONLY (page memory only). Usage: node checks/claims-a-lean-never-turns-the-map.mjs [--town=huron] [--base=http://localhost:5173]
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const TOWN = arg('town', 'huron'), BASE = arg('base', 'http://localhost:5173')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LEAN = Number(readFileSync(join(ROOT, 'src/lib/cameraRegimes.js'), 'utf8').match(/export const PLAN_MAX_LEAN_DEG = ([\d.]+)/)?.[1])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []

const profile = mkdtempSync(join(tmpdir(), 'lean-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {}; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {}; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
const done = () => {
  if (problems.length) console.log(`RED  ${TOWN}: the map leans without turning, and a frame lands straight down\n  ${problems.join('\n  ')}`)
  else console.log(`GREEN  ${TOWN}: the map leans (≤ ${LEAN}°) without turning, and a frame lands straight down`)
  cleanup(); process.exit(problems.length ? 1 : 0)
}
const fail = (m) => { problems.push(m); done() }
process.on('uncaughtException', (e) => fail(`threw: ${e.message}`))
process.on('unhandledRejection', (e) => fail(`threw: ${e?.message || e}`))
if (!(LEAN > 0)) fail('cameraRegimes.js names no PLAN_MAX_LEAN_DEG — there is no lean to check')

let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, S)   // two-finger drags reach the page
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('preview.mode.v1','desktop'); localStorage.setItem('cartograph-last-stage-shot','browse'); localStorage.removeItem('preview.layers.v3')" }, S)
const js = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value }
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
let ready = false
for (let i = 0; i < 1200 && !ready; i++) { await sleep(100); ready = await js("performance.getEntriesByName('ward:reveal').length > 0 && !!window.__townProbe && window.__flight?.current?.to === 'plan' && !!window.__flight.current.landed").catch(() => false) }
if (!ready) fail(`the town never revealed in the plan shot at ${BASE} — the check saw nothing`)
await sleep(4000)

// The view's lean off straight down (degrees) and the rose's bearing, read off the live camera and Town's bearingRef.
const view = () => js(`(() => { const c = window.__previewCamera, d = new c.position.constructor(); c.getWorldDirection(d)
  return { lean: Math.acos(Math.min(1, -d.y)) * 180 / Math.PI, bearing: window.__townProbe.bearingRef.current } })()`)
const canvasMid = await js(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })()`)
const [cx, cy] = canvasMid
const mouseDrag = async (dx, dy) => {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: 'none' }, S)
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'right', buttons: 2, clickCount: 1 }, S)
  for (let i = 1; i <= 20; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + dx * i / 20, y: cy + dy * i / 20, button: 'right', buttons: 2 }, S); await sleep(16) }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + dx, y: cy + dy, button: 'right', buttons: 0, clickCount: 1 }, S)
  await sleep(1500)
}
const touchDrag = async (dy) => {
  const pts = (k) => [{ x: cx - 60, y: cy + dy * k, id: 1 }, { x: cx + 60, y: cy + dy * k, id: 2 }]
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) }, S)
  for (let i = 1; i <= 20; i++) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i / 20) }, S); await sleep(16) }
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, S)
  await sleep(1500)
}
const near = (a, b, tol) => Math.abs(((a - b + 540) % 360) - 180) <= tol

const v0 = await view()
if (v0.lean > 1) problems.push(`the plan does not start straight down (lean ${v0.lean.toFixed(1)}°)`)
await mouseDrag(0, -260)
const v1 = await view()
if (!(v1.lean > 3)) problems.push(`a vertical right-drag leaned the view ${v1.lean.toFixed(1)}° — no lean`)
if (v1.lean > LEAN + 0.5) problems.push(`a vertical right-drag leaned ${v1.lean.toFixed(1)}°, past PLAN_MAX_LEAN_DEG ${LEAN}°`)
if (!near(v1.bearing, v0.bearing, 0.5)) problems.push(`the lean turned the map: bearing ${v0.bearing.toFixed(1)}° → ${v1.bearing.toFixed(1)}°`)
await mouseDrag(-600, 0)
const v2 = await view()
if (!near(v2.bearing, v0.bearing, 0.5)) problems.push(`a horizontal right-drag turned the map: bearing ${v0.bearing.toFixed(1)}° → ${v2.bearing.toFixed(1)}°`)
if (Math.abs(v2.lean - v1.lean) > 1) problems.push(`a horizontal right-drag changed the lean ${v1.lean.toFixed(1)}° → ${v2.lean.toFixed(1)}°`)
await mouseDrag(0, -2000)
const v3 = await view()
if (v3.lean > LEAN + 0.5) problems.push(`a long drag leaned ${v3.lean.toFixed(1)}°, past PLAN_MAX_LEAN_DEG ${LEAN}°`)
// Touch: back to straight down by a frame, then two fingers.
// Society's one move, and wait for the town to say it landed (never a fixed pause).
const frame = async () => {
  await js(`(() => { window.__before = window.__flight.current; const p = window.__townProbe; p.setLitIds(p.listingIds.slice(0, 5)); p.setFrameKey((k) => (k || 0) + 1); return true })()`)
  for (let i = 0; i < 100; i++) { await sleep(150); if (await js('window.__flight.current !== window.__before && !!window.__flight.current?.landed')) break }
  await sleep(600)
}
await frame()
const v4 = await view()
if (v4.lean > 1) problems.push(`after a lean, a framing move landed leaning ${v4.lean.toFixed(1)}° — Society's moves land straight down`)
if (!near(v4.bearing, v0.bearing, 0.5)) problems.push(`a framing move after a lean left the bearing at ${v4.bearing.toFixed(1)}° (was ${v0.bearing.toFixed(1)}°)`)
await touchDrag(-200)
const v5 = await view()
if (!(v5.lean > 3)) problems.push(`a two-finger vertical drag leaned the view ${v5.lean.toFixed(1)}° — no lean on touch`)
if (v5.lean > LEAN + 0.5) problems.push(`a two-finger drag leaned ${v5.lean.toFixed(1)}°, past ${LEAN}°`)
if (!near(v5.bearing, v0.bearing, 0.5)) problems.push(`a two-finger lean turned the map: bearing → ${v5.bearing.toFixed(1)}°`)
done()
