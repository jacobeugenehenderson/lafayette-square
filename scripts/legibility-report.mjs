#!/usr/bin/env node
/**
 * legibility-report.mjs — every poured town's plan view, at noon, dusk and midnight, measured (BRIEF-map-legibility-floor).
 *
 * Drives legibility.html (src/harness/lab/legibility.jsx) in HEADLESS Chrome against the dev server that is
 * already running, collects each case's numbers and frames, and writes:
 *   scratch/legibility-runs/<date>/report.json     every number, per town × hour, with how it was measured
 *   scratch/legibility-runs/<date>/index.html      the contact sheet Jacob calibrates the floor from, by eye
 *   scratch/legibility-runs/<date>/<town>-<at>-<frame>.png
 * ⛔ NO THRESHOLD and no pass/fail: the floor is Jacob's, set from the contact sheet.
 * ⛔ A throwaway Chrome profile under the OS temp dir, killed after the run — never anyone's own profile. No server
 *    is started: the page is served by the dev server already on 5173 (`vite` must be running).
 *
 *   node scripts/legibility-report.mjs                       every town with a disc × noon, dusk, midnight
 *   node scripts/legibility-report.mjs --town=huron --at=noon,midnight
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.DEV_URL || 'http://localhost:5173'
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
const HOURS = (arg('at') || 'noon,dusk,midnight').split(',')
const FRAMES = (arg('frame') || 'lit,disc').split(',')   // lit = Society's own framing (calibrate on this); disc = the whole town
const CASE_TIMEOUT_MS = 6 * 60000

// Towns: every Look whose slab has a disc. A town with no disc is REPORTED, not skipped.
const looks = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8')).looks.map((l) => l.id)
const wanted = arg('town') ? arg('town').split(',') : looks
const towns = [], noDisc = []
for (const t of wanted) {
  const g = join(ROOT, 'public/baked', t, 'ground.json')
  if (!existsSync(g)) { noDisc.push({ town: t, why: 'no baked ground.json' }); continue }
  if (!JSON.parse(readFileSync(g, 'utf8')).stencil) { noDisc.push({ town: t, why: 'stencil null — no disc' }); continue }
  towns.push(t)
}

// ── headless Chrome over the DevTools protocol (node's own WebSocket; no dependency) ─────────────────
const profile = mkdtempSync(join(tmpdir(), 'legibility-chrome-'))
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=900,1000', '--enable-gpu', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130) })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let port = null
for (let i = 0; i < 100 && !port; i++) {
  const f = join(profile, 'DevToolsActivePort')
  if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]
  else await sleep(100)
}
if (!port) { console.error('⛔ headless Chrome did not start'); process.exit(2) }
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
const ws = new WebSocket(webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0
const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
})

// ── the run ─────────────────────────────────────────────────────────────────────────────────────────
const day = new Date().toISOString().slice(0, 10)
const OUT = join(ROOT, 'scratch/legibility-runs', day)
mkdirSync(OUT, { recursive: true })
const cases = []
for (const town of towns) for (const at of HOURS) for (const frame of FRAMES) {
  const t0 = Date.now()
  process.stdout.write(`  ${town.padEnd(26)} ${at.padEnd(9)} ${frame.padEnd(5)} `)
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  let result = null
  try {
    await cdp('Page.enable', {}, sessionId)
    await cdp('Page.navigate', { url: `${BASE}/legibility.html?look=${encodeURIComponent(town)}&at=${at}&frame=${frame}` }, sessionId)
    while (Date.now() - t0 < CASE_TIMEOUT_MS) {
      await sleep(1500)
      const r = await cdp('Runtime.evaluate', { expression: 'window.__legibility ? JSON.stringify(window.__legibility) : null', returnByValue: true }, sessionId)
      if (r.result?.value) { result = JSON.parse(r.result.value); break }
    }
  } catch (e) { result = { error: e.message } }
  await cdp('Target.closeTarget', { targetId }).catch(() => {})
  if (!result) result = { error: `no result in ${CASE_TIMEOUT_MS / 60000} min` }
  const frames = {}
  for (const [k, url] of Object.entries(result.frames || {})) {
    const f = `${town}-${at}-${frame}-${k}.png`
    writeFileSync(join(OUT, f), Buffer.from(url.split(',')[1], 'base64'))
    frames[k] = f
  }
  const { frames: _drop, ...rest } = result
  cases.push({ town, at, framing: frame, ...rest, frames, seconds: Math.round((Date.now() - t0) / 1000) })
  console.log(result.error ? `⛔ ${result.error}` : `${Math.round((Date.now() - t0) / 1000)} s`)
}
ws.close(); cleanup()

// ── the report and the contact sheet ────────────────────────────────────────────────────────────────
const renderers = [...new Set(cases.map((c) => c.renderer).filter(Boolean))]
const software = renderers.some((r) => /swiftshader|llvmpipe|software/i.test(r))
const report = {
  written: new Date().toISOString(), threshold: null,
  note: 'No threshold: Jacob calibrates the floor by eye from index.html. Numbers are WCAG contrast ratios of on-screen relative luminance.',
  camera: 'the harness\'s own (straight down, fitted to the disc, north up) — the product\'s Society framing is the Ward\'s, so the two can differ',
  weather: 'clear (rain is a later pass)', renderers, softwareWebGL: software,
  openQuestions: [
    'Roof coverage: the rendered roof mask can read far below the footprint area computed from buildings.bin ' +
    '(huron 2026-09-28: 0.23% rendered vs 1.25% computed, lit framing). Cause not established.',
  ],
  notMeasured: noDisc, cases,
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n')

const fmt = (s) => (s ? `${s.median} <span class=q>(p10 ${s.p10} · p90 ${s.p90})</span>` : '—')
const row = (c) => c.error ? `<tr><td>${c.town}</td><td>${c.at}</td><td colspan=4 class=err>⛔ ${c.error}</td></tr>` : `
<tr><td>${c.town}</td><td>${c.at} · ${c.framing}<div class=q>${c.time}</div></td>
<td>${['full', 'noBuildings', 'noLabels', 'lit'].map((k) => c.frames[k] ? `<figure><img src="${c.frames[k]}"><figcaption>${k}</figcaption></figure>` : '').join('')}</td>
<td>roof vs ground ${fmt(c.metrics.roofVsGround.contrast)}<div class=q>roofs ${c.metrics.roofVsGround.coveragePct}% of frame</div></td>
<td>lit vs unlit ${c.metrics.litVsUnlit.contrastOfMedians ?? '—'}<div class=q>${c.lit ? `lit: ${c.lit.category} (${c.lit.buildings})` : 'no lit set'}</div></td>
<td>label ${fmt(c.metrics.label.contrast)}<div class=q>labels ${c.metrics.label.coveragePct}% · motion excluded ${c.metrics.motionExcludedPct}%${c.unsettled?.length ? ` · ⚠ unsettled: ${c.unsettled.join(', ')}` : ''}</div></td></tr>`
writeFileSync(join(OUT, 'index.html'), `<!doctype html><meta charset=utf-8><title>Legibility ${day}</title>
<style>body{font:13px/1.4 system-ui;background:#111;color:#ddd;margin:16px}table{border-collapse:collapse}td{border-top:1px solid #333;padding:8px;vertical-align:top}
figure{display:inline-block;margin:0 6px 0 0}img{width:220px;display:block}figcaption,.q{font-size:11px;color:#999}.err{color:#f88}.warn{color:#fc6}</style>
<h1>Map legibility — ${day}</h1>
<p>Society's plan view at phone half-height, weather clear, the phone quality profile. <b>No threshold</b>: mark which frames read and which don't; the floor is set from that.</p>
<p class=q>Camera: ${report.camera}. Renderer: ${renderers.join(' · ') || 'unknown'}${software ? ' — <span class=warn>⚠ SOFTWARE WebGL (SwiftShader): colours are real, speed is not</span>' : ''}.</p>
${noDisc.length ? `<p class=warn>Not measured: ${noDisc.map((n) => `${n.town} (${n.why})`).join(', ')}</p>` : ''}
<table>${cases.map(row).join('')}</table>`)
console.log(`\n→ ${join('scratch/legibility-runs', day)}/index.html  (report.json beside it)`)
process.exit(0)
