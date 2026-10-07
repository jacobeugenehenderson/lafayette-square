#!/usr/bin/env node
/**
 * "DOES PREVIEW'S FRAME COST TELL GPU TIME FROM MAIN-THREAD TIME, AND CAN EACH BE SEEN TO MOVE ALONE?"
 *
 * WHY (Phase 2 E): a 2-second frame with 5 ms of script is GPU-bound (HPDM, 2026-10-03), and the wall-clock frame
 * interval cannot say so. src/preview/frameCost.js reads GPU ms off EXT_disjoint_timer_query_webgl2 and main ms off
 * the frame's own callbacks. This check loads Preview cold (desktop target) and loads each side on its own:
 *   1. the GPU timer is exposed (headless Chrome on this Mac runs the real GPU) and both numbers read;
 *   2. MAIN LOAD: a 30 ms busy-wait inside each frame (window.__burnMainMs) raises main ms by ≥ 25 and leaves GPU ms
 *      within 1.5× the rest noise. Every load is bracketed by rest readings: the rest-to-rest spread IS the noise on
 *      this machine right now (a shared GPU moved the rest reading 180 → 340 ms between runs, 2026-10-04);
 *   3. GPU LOAD: a fullscreen shader looping 8,000 times per pixel, drawn inside the timed window (window.__burnGpuLoops),
 *      raises GPU ms past both 25% and twice the rest noise, and main ms by < 5.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-preview-frame-cost-splits.mjs --town=<town> [--base=http://localhost:5173]
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requiredTown } from './_scenes.mjs'

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const TOWN = requiredTown('town')
const BASE = arg('base') || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'startup-marks-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
// chrome.kill reaches only the launcher pid; the browser's own processes survive it, so they are killed by profile too
// (they leaked for an hour once, contending for the GPU with another session's probe).
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(2) })
process.on('unhandledRejection', (e) => { console.error(e); cleanup(); process.exit(2) })
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

const show = (f) => `GPU ${f.gpuMs?.toFixed(2)} ms · main ${f.mainMs?.toFixed(2)} ms · wall ${f.wallMs} ms`
// Each load is bracketed by rest readings; the rest-to-rest spread is this machine's noise right now (other work on a
// shared GPU moves it), and a load must stand clear of it.
const rest1 = await read()
console.log(`  ${TOWN} desktop, at rest: ${show(rest1)}`)
if (!rest1.gpuSupported) { console.error('⛔ the GPU timer is not exposed here, so this check proves nothing'); done(1) }
if (rest1.gpuMs == null) fails.push('the GPU timer is exposed but returned no reading')

await js('window.__burnMainMs = 30')
const cpu = await read()
await js('window.__burnMainMs = 0')
console.log(`  main load (+30 ms busy-wait): ${show(cpu)}`)
const rest2 = await read()
console.log(`  at rest again: ${show(rest2)}`)
await js('window.__burnGpuLoops = 8000')
const gpu = await read()
await js('window.__burnGpuLoops = 0')
console.log(`  GPU load (fullscreen shader, 8,000 loops a pixel): ${show(gpu)}`)
const rest3 = await read()
console.log(`  at rest again: ${show(rest3)}`)

const noise = Math.max(Math.abs(rest1.gpuMs - rest2.gpuMs), Math.abs(rest2.gpuMs - rest3.gpuMs), (rest1.gpuMs + rest2.gpuMs) / 2 * 0.05)
const restA = (rest1.gpuMs + rest2.gpuMs) / 2, restB = (rest2.gpuMs + rest3.gpuMs) / 2
console.log(`  GPU noise at rest: ±${noise.toFixed(1)} ms`)
if (cpu.mainMs - (rest1.mainMs + rest2.mainMs) / 2 < 25) fails.push(`a 30 ms main-thread burn moved main ms by only ${(cpu.mainMs - (rest1.mainMs + rest2.mainMs) / 2).toFixed(1)}`)
if (Math.abs(cpu.gpuMs - restA) > noise * 1.5) fails.push(`a main-thread burn moved GPU ms by ${(cpu.gpuMs - restA).toFixed(1)}, past the rest noise (±${noise.toFixed(1)}): the GPU reading is not GPU time`)
if (!(gpu.gpuMs - restB > Math.max(noise * 2, restB * 0.25))) fails.push(`known GPU work moved GPU ms only ${restB.toFixed(1)} → ${gpu.gpuMs?.toFixed(1)} (noise ±${noise.toFixed(1)})`)
if (gpu.mainMs - (rest2.mainMs + rest3.mainMs) / 2 >= 5) fails.push(`GPU work moved main ms by ${(gpu.mainMs - (rest2.mainMs + rest3.mainMs) / 2).toFixed(1)}: the main reading is counting the GPU`)

if (fails.length) { console.error(`⛔ frame cost (${TOWN}):\n  - ${fails.join('\n  - ')}`); done(1) }
console.log(`✅ frame cost (${TOWN}): GPU and main-thread time read apart, and each moves alone under its own load`)
done(0)
