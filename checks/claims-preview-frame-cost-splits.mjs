#!/usr/bin/env node
/**
 * "DOES PREVIEW'S FRAME COST TELL GPU TIME FROM MAIN-THREAD TIME, AND CAN EACH BE SEEN TO MOVE ALONE?"
 *
 * WHY (Phase 2 E): a 2-second frame with 5 ms of script is GPU-bound (HPDM, 2026-10-03), and the wall-clock frame
 * interval cannot say so. src/preview/frameCost.js reads GPU ms off EXT_disjoint_timer_query_webgl2 and main ms off
 * the frame's own callbacks. This check loads Preview cold (desktop target) and loads each side on its own:
 *   1. the GPU timer is exposed (headless Chrome on this Mac runs the real GPU) and both numbers read;
 *   2. MAIN LOAD: a 30 ms busy-wait inside each frame (window.__burnMainMs) raises main ms by ≥ 25 and leaves GPU ms
 *      within 10% (its run-to-run noise was ±3% on LS, 2026-10-04);
 *   3. GPU LOAD: a fullscreen shader looping 8,000 times per pixel, drawn inside the timed window (window.__burnGpuLoops),
 *      raises GPU ms by ≥ 25% and main ms by < 5.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-preview-frame-cost-splits.mjs [--town=lafayette-square] [--base=http://localhost:5173]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const TOWN = arg('town') || 'lafayette-square'
const BASE = arg('base') || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'startup-marks-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }

const fails = []
const done = (code) => { ws.close(); cleanup(); process.exit(code) }

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('preview.mode.v1', 'desktop')" }, S)
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S)).result?.value
let ready = false
for (let i = 0; i < 90 && !ready; i++) { await sleep(1000); ready = await js("!!(window.__previewFrame && performance.getEntriesByName('ward:first-truthful-frame').length)") }
if (!ready) { console.error('⛔ Preview never reached its FIRST TRUTHFUL FRAME with the frame-cost gauge installed'); done(1) }
await sleep(4000)
// The gauge averages 30 frames; at a few frames a second that is ~10 s, so each reading waits for a full window.
const read = async () => { await sleep(12000); return js('window.__previewFrame()') }

const base = await read()
const show = (f) => `GPU ${f.gpuMs?.toFixed(2)} ms · main ${f.mainMs?.toFixed(2)} ms · wall ${f.wallMs} ms`
console.log(`  ${TOWN} desktop, at rest: ${show(base)}`)
if (!base.gpuSupported) { console.error('⛔ the GPU timer is not exposed here, so this check proves nothing'); done(1) }
if (base.gpuMs == null) fails.push('the GPU timer is exposed but returned no reading')

await js('window.__burnMainMs = 30')
const cpu = await read()
await js('window.__burnMainMs = 0')
console.log(`  main load (+30 ms busy-wait): ${show(cpu)}`)
if (cpu.mainMs - base.mainMs < 25) fails.push(`a 30 ms main-thread burn moved main ms by only ${(cpu.mainMs - base.mainMs).toFixed(1)}`)
if (Math.abs(cpu.gpuMs - base.gpuMs) >= base.gpuMs * 0.1) fails.push(`a main-thread burn moved GPU ms by ${(cpu.gpuMs - base.gpuMs).toFixed(1)}: the GPU reading is not GPU time`)

await sleep(2000)
const base2 = await read()
console.log(`  at rest again: ${show(base2)}`)
await js('window.__burnGpuLoops = 8000')
const gpu = await read()
await js('window.__burnGpuLoops = 0')
console.log(`  GPU load (fullscreen shader, 8,000 loops a pixel): ${show(gpu)}`)
if (!(gpu.gpuMs >= base2.gpuMs * 1.25)) fails.push(`known GPU work moved GPU ms only ${base2.gpuMs?.toFixed(2)} → ${gpu.gpuMs?.toFixed(2)}`)
if (gpu.mainMs - base2.mainMs >= 5) fails.push(`GPU work moved main ms by ${(gpu.mainMs - base2.mainMs).toFixed(1)}: the main reading is counting the GPU`)

if (fails.length) { console.error(`⛔ frame cost (${TOWN}):\n  - ${fails.join('\n  - ')}`); done(1) }
console.log(`✅ frame cost (${TOWN}): GPU and main-thread time read apart, and each moves alone under its own load`)
done(0)
