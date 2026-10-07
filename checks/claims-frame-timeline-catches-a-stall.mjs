#!/usr/bin/env node
/**
 * "DOES PREVIEW'S FRAME TIMELINE CATCH A HITCH, TIME IT, AND PUT IT BESIDE WHAT CAUSED IT?" — and the scripted runs.
 *
 * WHY (BRIEF-hero-arrival-perf step 0): the scene is choppy, and the eye judges the time between presented frames, not
 * an average. The recorder (src/preview/phoneBus.js#frameTimeline) holds every frame interval (rAF deltas) and, on the
 * same clock, the marks a hitch may sit on (files, programs / uploads, KTX2 pages, slider input, long frames). This
 * check loads Preview cold, headless, and runs the same scripted path every time:
 *   a. COLD into Hero: the page's own load, held to --hold ms, the movie entering at --movieAt seconds;
 *   ⛔ MUTATION: one injected 50 ms stall (window.__stallOnceMs) must come back as a hitch ≥ p50 + 45 ms carrying the
 *      stall's mark. A recorder that cannot see a stall it was handed proves nothing about the stalls it reports;
 *   c. HERO MOVE: the movie restarted at --movieAt, recorded --runMs, TWICE: the two are this machine's noise;
 *   b. SLIDER SCRUB: the same move, with the time slider dragged across the day at a fixed rate (real pointer input).
 * Prints, per run: p50 / p95 / max, frames over the target's budget, and each hitch with its marks.
 * --off=trees,lights,…  hides Preview layers (preview.layers.v3 keys) for the whole page: attribution by removal.
 * --query=k=v&…  extra Preview URL parameters (e.g. frameloop=demand: the Ward's frame loop).
 * --eval=<js>  runs once after the cold run, 3 s before the timed runs (e.g. `__previewGl.shadowMap.enabled=false`).
 *
 * ⛔ HEADLESS IS NOT THE OPERATOR'S EYE: this is the desktop target on this Mac's GPU, 1280×800 at DPR 1 by default, no vsync
 * guarantee. Every number it prints says so. Jacob's browser is the gate.
 * ⛔ READ-ONLY. Usage: node checks/claims-frame-timeline-catches-a-stall.mjs [--town=huron] [--base=http://localhost:5173]
 *   [--window=1280x800] [--dpr=1] [--movieAt=0] [--hold=30000] [--runMs=8000] [--off=] [--json] [--raw (run a's every frame + mark)] [--only=a|stall|c|b]
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir, loadavg } from 'node:os'
import { join } from 'node:path'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = arg('town', 'huron')
const BASE = arg('base', 'http://localhost:5173')
const MOVIE_AT = Number(arg('movieAt', '0'))
const HOLD = Number(arg('hold', '30000'))
const RUN_MS = Number(arg('runMs', '8000'))
const OFF = (arg('off', '') || '').split(',').filter(Boolean)
const ONLY = arg('only', null)
const QUERY = process.argv.find((a) => a.startsWith('--query='))?.slice(8) || ''
const EVAL = process.argv.find((a) => a.startsWith('--eval='))?.slice(7) || null
const JSON_OUT = process.argv.includes('--json')
const STALL = 50
// --window=WxH and --dpr=N: a surface's own pixel count (the operator's screen), since full-screen passes scale with it.
const WIN = arg('window', '1280,800').replace('x', ','), DPR = arg('dpr', '1')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'frame-timeline-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', `--window-size=${WIN}`, `--force-device-scale-factor=${DPR}`, 'about:blank'], { stdio: 'ignore' })
// chrome.kill reaches only the launcher pid; the browser's own processes are killed by profile too.
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(2) })
process.on('unhandledRejection', (e) => { console.error(e); cleanup(); process.exit(2) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
const errors = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)
}
const done = (code) => { ws.close(); cleanup(); process.exit(code) }

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
const layers = OFF.length ? `localStorage.setItem('preview.layers.v3', JSON.stringify(${JSON.stringify(Object.fromEntries(OFF.map((k) => [k, false])))}));` : "localStorage.removeItem('preview.layers.v3');"
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.mode.v1', 'desktop'); localStorage.setItem('cartograph-last-stage-shot', 'hero'); ${layers} window.__coldHoldMs = ${HOLD};` }, S)
const js = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S)
  if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`)
  return r.result?.value
}
const fails = []
const out = { town: TOWN, surface: `headless Chrome · desktop target · window ${WIN.replace(',', '×')} DPR ${DPR} · this Mac`, movieAt: MOVIE_AT, off: OFF, runs: {} }

// The machine's 1-minute load beside every run: a frame series taken on a busy machine is not the town's.
const load = () => +loadavg()[0].toFixed(1)
const show = (name, t) => {
  t.loadAfter = load()
  out.runs[name] = t
  if (JSON_OUT) return
  console.log(`\n▶ ${name} — load ${t.loadAfter} — ${t.frames} frames over ${(t.spanMs / 1000).toFixed(1)} s (${t.fps} fps) · budget ${t.budgetMs} ms (${t.target})`)
  console.log(`  main p50 ${t.mainP50} ms · draws p50 ${t.callsP50} · tris p50 ${(t.trisP50 / 1e6).toFixed(2)} M`)
  console.log(`  p50 ${t.p50} · p95 ${t.p95} · p99 ${t.p99} · max ${t.max} ms · over budget ${t.over}/${t.frames} · hitch ≥ ${t.hitchMs} ms: ${t.hitches.length} · marks ${t.marks} · files ${t.files}`)
  for (const h of t.hitches.slice(0, 40)) {
    console.log(`  · ${(h.atMs / 1000).toFixed(2)} s  ${String(h.ms).padStart(6)} ms  ${h.marks.length ? h.marks.slice(0, 6).join(' | ') + (h.marks.length > 6 ? ` | …+${h.marks.length - 6}` : '') : '(no mark: cause not established)'}`)
  }
  if (t.hitches.length > 40) console.log(`  · …+${t.hitches.length - 40} more (--json for all)`)
}

// ── a. cold into Hero ──
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}&movieAt=${MOVIE_AT}${QUERY ? '&' + QUERY : ''}` }, S)
let ready = false
for (let i = 0; i < 120 && !ready; i++) { await sleep(1000); ready = await js("!!window.__frameTimeline && !!window.__townProbe?.restartMovie").catch(() => false) }
if (!ready) { console.error('⛔ Preview never exposed the frame timeline'); done(1) }
out.buffer = await js("window.__previewGl ? __previewGl.domElement.width + '×' + __previewGl.domElement.height + ' @ glPR ' + __previewGl.getPixelRatio() : null")
out.surface += ` · buffer ${out.buffer}`
let cold = null
for (let i = 0; i < Math.ceil(HOLD / 1000) + 60; i++) {
  await sleep(1000)
  cold = await js(`window.__frameTimeline({ raw: ${process.argv.includes('--raw')} })`)
  if (cold.status === 'stopped') break
}
if (cold?.status !== 'stopped') { console.error('⛔ the cold recording never stopped'); done(1) }
const marks = await js("Object.fromEntries(performance.getEntriesByType('mark').filter(m => m.name.startsWith('ward:')).map(m => [m.name.slice(5), Math.round(m.startTime)]))")
out.startup = marks
if (!ONLY || ONLY === 'a') {
  show('a · cold into Hero', cold)
  if (!JSON_OUT) console.log(`  startup marks (ms): ${Object.entries(marks).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
}
if (!marks['first-truthful-frame']) fails.push('no FIRST TRUTHFUL FRAME in the cold run')

if (EVAL) { out.eval = EVAL; await js(EVAL); await sleep(3000) }

// ── ⛔ mutation: one injected stall ──
if (!ONLY || ONLY === 'stall') {
  const run = js(`window.__frameRun('stall', 4000)`)
  await sleep(2000)
  await js(`window.__stallOnceMs = ${STALL}; true`)
  const t = await run
  show(`⛔ mutation · one injected ${STALL} ms stall`, t)
  const hit = t.hitches.find((h) => h.marks.some((m) => m.includes(`injected stall ${STALL} ms`)))
  if (!hit) fails.push(`the injected ${STALL} ms stall was not reported as a hitch carrying its mark`)
  else if (hit.ms - t.p50 < STALL * 0.9) fails.push(`the injected stall was caught but timed at ${hit.ms} ms against a p50 of ${t.p50}: short of +${STALL}`)
  else if (!JSON_OUT) console.log(`  ✅ caught: ${hit.ms} ms at ${(hit.atMs / 1000).toFixed(2)} s, +${(hit.ms - t.p50).toFixed(1)} over p50, beside its mark`)
}

const heroRun = async (label, during) => {
  await js('window.__townProbe.restartMovie(); true')
  await sleep(300)
  const run = js(`window.__frameRun(${JSON.stringify(label)}, ${RUN_MS})`)
  if (during) await during()
  return run
}

// ── c. the Hero camera move, twice (the noise) ──
if (!ONLY || ONLY === 'c') {
  show('c · Hero move (1)', await heroRun('hero move 1'))
  show('c · Hero move (2) — the repeat is the noise', await heroRun('hero move 2'))
}

// ── b. the time slider, dragged across the day at a fixed rate ──
if (!ONLY || ONLY === 'b') {
  const box = await js(`(() => { const r = document.querySelector('[data-tod="track"]')?.getBoundingClientRect(); return r && r.width ? { x: r.left, y: r.top + r.height / 2, w: r.width } : null })()`)
  if (!box) fails.push('no time slider on the page ([data-tod="track"]) to scrub')
  else {
    const t = await heroRun('slider scrub', async () => {
      const mouse = (type, x) => cdp('Input.dispatchMouseEvent', { type, x, y: box.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, S)
      const x0 = box.x + 2, x1 = box.x + box.w - 2, dur = RUN_MS - 1000
      await mouse('mousePressed', x0)
      const t0 = Date.now()
      for (let el = 0; el < dur; el = Date.now() - t0) { await mouse('mouseMoved', x0 + (x1 - x0) * (el / dur)); await sleep(16) }
      await mouse('mouseReleased', x1)
    })
    show('b · slider scrub across the day, real pointer input', t)
    const inputs = (await js('window.__frameTimeline({raw:true})')).raw.spans.filter((s) => s[0] === 'input').length
    if (!JSON_OUT) console.log(`  slider input marks: ${inputs}`)
    if (!inputs) fails.push('the scrub ran but no slider input reached the timeline')
  }
}

if (errors.length) console.log(`\n  page exceptions: ${errors.length} — ${errors[0]?.split('\n')[0]}`)
if (JSON_OUT) console.log(JSON.stringify(out, null, 1))
console.log(`\n  surface: ${out.surface}${OFF.length ? ` · OFF: ${OFF.join(',')}` : ''}${EVAL ? ` · eval: ${EVAL}` : ''}${QUERY ? ` · query: ${QUERY}` : ''}`)
console.log(fails.length ? `⛔ ${fails.join('\n⛔ ')}` : '✅ the frame timeline caught, timed and attributed the injected stall')
done(fails.length ? 1 : 0)
