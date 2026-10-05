// Does frameCost.js#gpuWindow measure GPU WORK, or the frame's batch STRUCTURE? (Latch, 2026-10-05; follows Rung's
// scratch/pyramid-rung, which found the gauge reading ~2.6× the uncapped frame time on this M1.)
// READ-ONLY on disk: drives the running :5173 Preview in headless Chrome with vsync off, so the frame interval is real.
//
//   node scratch/gauge-truth/probe.mjs [--town=lafayette-square] [--mode=desktop] [--breaks=16]
//
// Conditions, each bracketed rest · X · rest, read with BOTH instruments over the same window:
//   work    — window.__burnGpuLoops (frameCost's own hook): a fullscreen shader loop. Real GPU work, little structure.
//   breaks  — after each renderer.render call, N tiny "empty passes": bind a 1×1 target, clear it, flush. Almost no GPU
//             work, but each forces a new render pass on the GPU. A gauge of GPU work must not move much here.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = arg('town', 'lafayette-square'), MODE = arg('mode', 'desktop'), BASE = arg('base', 'http://localhost:5173')
const BREAKS = Number(arg('breaks', '16')), LOOPS = Number(arg('loops', '2000')), REPS = Number(arg('reps', '2'))
const SETTLE_S = Number(arg('settle', '45'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'runs'); mkdirSync(OUT, { recursive: true })

const profile = mkdtempSync(join(tmpdir(), 'gauge-truth-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1280,800', ...(process.argv.includes('--capped') ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']), 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error(e); cleanup(); process.exit(1) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
// ⛔ Nothing may be saved: every non-GET to the dev API fails.
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] }, S)
ws.addEventListener('message', async (e) => { const m = JSON.parse(e.data); if (m.method !== 'Fetch.requestPaused') return
  const { requestId, request } = m.params
  if (request.method === 'GET') await cdp('Fetch.continueRequest', { requestId }, S)
  else { console.log(`  ⛔ blocked a ${request.method} ${request.url}`); await cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, S) } })
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.mode.v1', '${MODE}')` }, S)
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value }
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)

const HELPERS = `(async () => {
  if (window.__gt) return true
  if (!window.__renderer || !window.__previewFrame) return false
  const fu = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/preview/frameCost.js'))
  if (!fu) return false
  const fc = await import(fu)
  // ⭐ THE CANDIDATE: the frame's SERIAL cost — from its first callback to the GPU having finished it (gl.finish in the
  // last after-effect). The previous frame was finished, so the GPU starts idle; nothing overlaps, nothing is summed.
  // Same r3f module instance as the app: imported by the exact URL the page loaded.
  const ru = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('@react-three_fiber'))
  if (!ru) return false
  const R3F = await import(ru)
  const serial = []; let st0 = 0
  R3F.addEffect(() => { st0 = performance.now() })
  R3F.addAfterEffect(() => { if (!window.__serialOn) return; window.__renderer.getContext().finish(); serial.push({ t: performance.now(), ms: performance.now() - st0 }) })
  const r = window.__renderer, gl = r.getContext()
  const fb = gl.createFramebuffer(), tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); r.resetState()
  window.__breaks = 0; window.__renderCalls = 0
  const render0 = r.render
  r.render = function (...a) {
    const v = render0.apply(this, a); window.__renderCalls++
    const n = window.__breaks
    if (n) { for (let i = 0; i < n; i++) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, 1, 1); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.flush() } r.resetState() }
    return v
  }
  window.__gt = { read: async (ms) => { let f = 0, live = true; const tick = () => { if (!live) return; f++; requestAnimationFrame(tick) }; requestAnimationFrame(tick)
    const c0 = window.__renderCalls, t0 = performance.now(); const g = await fc.gpuWindow(ms); live = false; const wall = performance.now() - t0
    const xs = serial.filter((x) => x.t >= t0).map((x) => x.ms)
    return { gauge: g.ms, n: g.n, frame: wall / f, frames: f, serial: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, callsPerFrame: (window.__renderCalls - c0) / f } } }
  return true
})()`
let ok = false
for (let s = 0; s < 120 && !ok; s++) { await sleep(1000); try { ok = await js(HELPERS) } catch {} }
if (!ok) { console.error('⛔ helpers never installed'); cleanup(); process.exit(1) }
console.log(`== ${TOWN} · ${MODE} · headless, vsync ${process.argv.includes('--capped') ? 'ON' : 'off'} · settling ${SETTLE_S} s`); await sleep(SETTLE_S * 1000)

const W = 3000
const read = () => js(`__gt.read(${W})`)
const rows = []
const bracket = async (label, enter, leave) => {
  const a = await read(); await js(enter); await sleep(1500); const x = await read(); await js(leave); await sleep(1500); const b = await read()
  const restG = (a.gauge + b.gauge) / 2, restF = (a.frame + b.frame) / 2, restS = (a.serial + b.serial) / 2
  const row = { label, restG, xG: x.gauge, dG: x.gauge - restG, noiseG: Math.abs(a.gauge - b.gauge) / 2,
    restF, xF: x.frame, dF: x.frame - restF, noiseF: Math.abs(a.frame - b.frame) / 2, calls: x.callsPerFrame, n: [a.n, x.n, b.n],
    restS, xS: x.serial, dS: x.serial - restS, noiseS: Math.abs(a.serial - b.serial) / 2 }
  rows.push(row)
  console.log(`  ${label.padEnd(30)} gauge ${restG.toFixed(2)} → ${x.gauge.toFixed(2)} (Δ ${row.dG.toFixed(2)} ±${row.noiseG.toFixed(2)}) ‖ frame ${restF.toFixed(2)} → ${x.frame.toFixed(2)} (Δ ${row.dF.toFixed(2)} ±${row.noiseF.toFixed(2)}) ‖ serial ${restS.toFixed(2)} → ${x.serial.toFixed(2)} (Δ ${row.dS.toFixed(2)} ±${row.noiseS.toFixed(2)})`)
}
if (process.argv.includes('--serial')) await js('window.__serialOn = true; true')
const SER = (process.argv.includes('--serial') ? '-serial' : '') + (process.argv.includes('--capped') ? '-capped' : '')
const rest = await read(); console.log(`  at rest: gauge ${rest.gauge?.toFixed(2)} ms · frame ${rest.frame.toFixed(2)} ms · ratio ${(rest.gauge / rest.frame).toFixed(2)}× · serial ${rest.serial?.toFixed(2)} ms · ${rest.callsPerFrame.toFixed(1)} render calls/frame`)
for (let k = 0; k < REPS; k++) {
  await bracket(`work: ${LOOPS} shader loops`, `window.__burnGpuLoops = ${LOOPS}`, 'window.__burnGpuLoops = 0')
  await bracket(`breaks: ${BREAKS} empty passes/call`, `window.__breaks = ${BREAKS}`, 'window.__breaks = 0')
}
writeFileSync(join(OUT, `${TOWN}-${MODE}-b${BREAKS}-l${LOOPS}${SER}.json`), JSON.stringify({ town: TOWN, mode: MODE, rest, rows }, null, 1))
cleanup(); process.exit(0)
