#!/usr/bin/env node
/**
 * "DOES A STEP OF THE TIME SLIDER COMPILE NOTHING?"
 *
 * WHY (BRIEF-hero-arrival-perf, Strobe 2026-10-06): the soft-shadow channel is time-of-day keyed in every town, and
 * drei's <SoftShadows> baked it into the shader source: each step disposed every material in the scene and recompiled
 * it (LS: 882 disposes, 96 program links, 2 renderer.compile calls for ONE step; huron: a 3–4 s frame). PCSS now reads
 * the penumbra at run time (src/components/pcssShadows.js). This check loads Preview cold (desktop, Hero), lets it
 * settle, then steps the slider across the day with real pointer input and counts, over every step:
 *   material dispose() calls · renderer.compile calls · programs RELEASED (renderer.info.programs losing one, i.e. a
 *   relink of something already drawn) — each must be 0;
 * and proves it is not vacuous: the sun's shadow radius (the PCSS stamp) must have taken at least two values, i.e.
 * the channel really changed under the slider.
 * A program linked for the FIRST time (something the day only now shows: LS links 3 when it reaches one hour) is not
 * a recompile, so it does not fail here; it is printed, because it is still a one-off hitch the slider can hit.
 * Mutation, run when the fix landed (a temporary `?pcssOld=1` that remounted drei's <SoftShadows>): LS failed with
 * 4,426 disposes · 315 programs released · 10 compile calls over 6 steps; the fixed path passed with 0 · 0 · 0.
 * ⛔ READ-ONLY. Usage: node checks/claims-a-slider-step-compiles-nothing.mjs --town=<town> [--steps=6]
 *   [--base=http://localhost:5173] [--query=k=v&…]
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requiredTown } from './_scenes.mjs'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const TOWN = requiredTown('town'), BASE = arg('base', 'http://localhost:5173'), STEPS = +arg('steps', '6')
const QUERY = arg('query', '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'slider-compiles-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(2) })
process.on('unhandledRejection', (e) => { console.error(e); cleanup(); process.exit(2) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const done = (code) => { ws.close(); cleanup(); process.exit(code) }

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('preview.mode.v1','desktop'); localStorage.setItem('cartograph-last-stage-shot','hero'); localStorage.removeItem('preview.layers.v3')" }, S)
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}${QUERY ? '&' + QUERY : ''}` }, S)
const js = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value }
let ready = false
for (let i = 0; i < 120 && !ready; i++) { await sleep(1000); ready = await js("!!window.__previewScene && performance.getEntriesByName('ward:first-truthful-frame').length > 0").catch(() => false) }
if (!ready) { console.error('⛔ Preview never reached its FIRST TRUTHFUL FRAME with the inspection hooks'); done(1) }
await sleep(15000)   // the progressive pieces (trees, lamps) land and link their programs first

// The hooks: every Material.dispose, every gl.linkProgram, every renderer.compile from here on.
const hooked = await js(`(() => {
  let m = null; window.__previewScene.traverse((o) => { if (!m && o.material && !Array.isArray(o.material)) m = o.material })
  let proto = Object.getPrototypeOf(m); while (proto && proto.constructor.name !== 'Material') proto = Object.getPrototypeOf(proto)
  if (!proto) return 'no Material prototype'
  window.__n = { dispose: 0, link: 0, compile: 0, released: 0 }
  window.__progs = new Set(window.__previewGl.info.programs)
  const od = proto.dispose; proto.dispose = function () { window.__n.dispose++; return od.apply(this, arguments) }
  const gl = window.__previewGl.getContext(); const ol = gl.linkProgram.bind(gl); gl.linkProgram = (p) => { window.__n.link++; return ol(p) }
  const r = window.__previewGl; const oc = r.compile; r.compile = function () { window.__n.compile++; return oc.apply(this, arguments) }
  return 'ok'
})()`)
if (hooked !== 'ok') { console.error(`⛔ ${hooked}`); done(1) }
const radius = `(() => { let r = null; window.__previewScene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) r = o.shadow.radius }); return r })()`
const box = await js(`(() => { const r = document.querySelector('[data-tod="track"]')?.getBoundingClientRect(); return r && r.width ? { x: r.left, y: r.top + r.height / 2, w: r.width } : null })()`)
if (!box) { console.error('⛔ no time slider ([data-tod="track"])'); done(1) }
const radii = new Set([await js(radius)])
for (let i = 0; i < STEPS; i++) {
  const x = box.x + 2 + (box.w - 4) * (i + 0.5) / STEPS
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: box.y, button: 'left', buttons: 1, clickCount: 1 }, S)
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: box.y, button: 'left', buttons: 0, clickCount: 1 }, S)
  await sleep(2500)
  radii.add(await js(radius))
  await js(`(() => { const now = new Set(window.__previewGl.info.programs); for (const p of window.__progs) if (!now.has(p)) window.__n.released++; window.__progs = now; return true })()`)
}
const n = await js('window.__n')
console.log(`  ${TOWN}${QUERY ? ` (${QUERY})` : ''}, ${STEPS} slider steps across the day: ${n.dispose} material disposes · ${n.released} programs released · ${n.compile} renderer.compile calls · ${n.link} program links (first-time links are not a failure)`)
console.log(`  the sun's shadow radius took ${radii.size} value(s): ${[...radii].join(', ')}`)
const fails = []
if (n.dispose) fails.push(`${n.dispose} material dispose() calls`)
if (n.released) fails.push(`${n.released} programs released (relinked)`)
if (n.compile) fails.push(`${n.compile} renderer.compile calls`)
if (!QUERY && radii.size < 2) fails.push('the shadow stamp never changed under the slider, so this proved nothing (is the channel keyed? is the sun casting?)')
console.log(fails.length ? `⛔ a slider step is not free: ${fails.join(' · ')}` : '✅ a slider step disposes, relinks and compiles nothing, while the penumbra moves with it')
done(fails.length ? 1 : 0)
