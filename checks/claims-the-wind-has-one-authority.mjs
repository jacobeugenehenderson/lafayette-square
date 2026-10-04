#!/usr/bin/env node
/**
 * claims-the-wind-has-one-authority — the wind sheet is driven by the town's ONE weather (lib/weatherAt.js), its air
 * is wind-field.js#windAt (one definition, read by the CPU and, as WIND_FIELD_GLSL, by the GPU), and a material that
 * samples the sheet computes no wind noise of its own.
 *
 * ⛔ THE CLASS: two winds. Before the sheet the overhead cards ran their own fBm, the water read the raw feed, the
 * trees an Almanac rule that carries no measured wind at all — a gust was three unrelated motions.
 *
 * STATIC (reads the source):
 *   · lib/windSheet.js#windStateOfWeather asks weatherAt; WindSheet.jsx takes its air from windStateOfWeather and
 *     reads neither the atmosphere directive nor resolveWindState. The one other input is a SPECIMEN's named wind
 *     (windStateOfSpecimen), refused on a town extent and required on a specimen one.
 *   · no file but wind-field.js defines the GLSL field (windFieldAt / wfValueNoise2D).
 *   · every CONSUMER (a src file that injects WIND_SHEET_GLSL or calls bindWindSheet, beyond the sheet's own three
 *     files) defines no noise function and reads no other wind (uWindForce, uGustsScale, windSpeedMs…).
 *     ⭐ The rule is run first on a planted consumer with its own fBm and must go red — or the check is BLIND.
 * LIVE (headless Chrome on the running dev server, unless --static): Preview loads the town, every program links,
 *   the sheet allocates, and its AIR read back from the GPU (`__windSheet.probeAir`) matches the CPU windAt at the
 *   same instant and texel centre, at 16 points, within half-float precision.
 * Mutation-tested 2026-10-04: a planted consumer with `float ovFbm(` → red; a changed constant in WIND_FIELD_GLSL's
 * hash → live red (GPU ≠ CPU).
 *
 * Run: node checks/claims-the-wind-has-one-authority.mjs [--static] [--town=huron] [--base=http://localhost:5173]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const STATIC_ONLY = process.argv.includes('--static')
const TOWN = arg('town') || 'huron'
const BASE = arg('base') || 'http://localhost:5173'
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const walk = (dir, out = []) => { for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(e)) out.push(p) } return out }
const fails = []

// ── STATIC ──────────────────────────────────────────────────────────────────────────────────────────────────────
const lib = strip(readFileSync(join(ROOT, 'src/lib/windSheet.js'), 'utf8'))
const fn = lib.match(/export function windStateOfWeather[\s\S]*?\n}\n/)
if (!fn) fails.push('lib/windSheet.js has no windStateOfWeather — re-aim this check')
else if (!/\bweatherAt\(/.test(fn[0])) fails.push('windStateOfWeather does not ask weatherAt — the sheet\'s wind is not the town\'s one weather')
else if (!/gustShape:/.test(fn[0])) fails.push('windStateOfWeather does not carry the gust\'s shape — it is part of the one cable, not a separate input')
const drv = strip(readFileSync(join(ROOT, 'src/components/WindSheet.jsx'), 'utf8'))
if (!/windStateOfWeather\(/.test(drv)) fails.push('WindSheet.jsx does not take its air from windStateOfWeather')
for (const bad of ['tweenedDirective', 'useAtmosphere', 'resolveWindState', 'treeSwayUniforms']) if (drv.includes(bad)) fails.push(`WindSheet.jsx reads ${bad} — a second wind authority`)
// ⭐ THE ONE CABLE: the sheet's frame reads the weather ONLY through that state — no store or weather read of its own.
for (const bad of ['feedStorminess', 'windSpeedMs', 'windDirDeg', 'windGustsMs', 'hourlyForecast']) if (drv.includes(bad)) fails.push(`WindSheet.jsx reads ${bad} itself — the weather reaches the sheet through windStateOfWeather's one object`)
// A specimen's named wind is the ONLY other input, and only where there is no town: a town + wind prop must throw.
if (!/extent === 'town' && wind !== undefined\) throw/.test(drv)) fails.push('WindSheet.jsx accepts a wind prop on a town extent — a town\'s wind is its weather')
if (!/specimenWind = extent === 'town' \? null : windStateOfSpecimen\(wind\)/.test(drv)) fails.push('WindSheet.jsx takes a specimen wind other than through windStateOfSpecimen, or on a town')
const spec = lib.match(/export function windStateOfSpecimen[\s\S]*?\n}\n/)
if (!spec || !/throw new Error/.test(spec[0])) fails.push('windStateOfSpecimen does not refuse a specimen without a named wind')

const OWN = new Set(['src/lib/windSheet.js', 'src/components/WindSheet.jsx', 'src/components/Town.jsx', 'src/lib/wind-field.js'])
const NOISE = /\bfloat\s+\w*(?:hash|noise|fbm)\w*\s*\(/i
const OTHER_WIND = /\b(?:uWindForce|uWindIntensity|uGustsScale|uGustEnvelope|uGustFrontVelocity|windSpeedMs|windDirDeg|uWindDir)\b/
const consumerFaults = (rel, src) => {
  const out = []
  if (NOISE.test(src)) out.push(`${rel} samples the wind sheet AND defines its own noise (${src.match(NOISE)[0]}) — the detail is windDetail's`)
  if (OTHER_WIND.test(src)) out.push(`${rel} samples the wind sheet AND reads another wind (${src.match(OTHER_WIND)[0]})`)
  return out
}
// ⭐ Prove the rule can see: a planted consumer with its own fBm must be caught.
const planted = 'import { WIND_SHEET_GLSL, bindWindSheet } from "../lib/windSheet.js"\nconst V = WIND_SHEET_GLSL + `float ovFbm(vec2 p){ return 0.0; }`'
if (!consumerFaults('planted', planted).length) { console.error('⛔ BLIND: the consumer rule does not catch a planted consumer with its own fBm'); process.exit(1) }
const consumers = []
for (const f of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, f)
  const src = strip(readFileSync(f, 'utf8'))
  if (rel !== 'src/lib/wind-field.js' && /\b(?:windFieldAt|wfValueNoise2D)\s*\(/.test(src) && !/WIND_FIELD_GLSL/.test(src)) fails.push(`${rel} defines its own GLSL wind field — the one definition is wind-field.js#WIND_FIELD_GLSL`)
  if (OWN.has(rel) || !/\b(?:WIND_SHEET_GLSL|bindWindSheet)\b/.test(src)) continue
  consumers.push(rel)
  fails.push(...consumerFaults(rel, src))
}
console.log(`  consumers of the sheet: ${consumers.length ? consumers.join(', ') : 'none yet (the rule is proven on a planted one)'}`)

// ── LIVE ────────────────────────────────────────────────────────────────────────────────────────────────────────
if (!STATIC_ONLY && !fails.length) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const profile = mkdtempSync(join(tmpdir(), 'wind-authority-'))
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
  const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
  try {
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
    await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
    let ready = false
    for (let i = 0; i < 120 && !ready; i++) { await sleep(1000); ready = await js('!!(window.__windSheet?.layout && window.__samplerCensus && window.__flight?.current?.landed)') }
    if (!ready) fails.push(`the ${TOWN} Preview never allocated the wind sheet in 120 s`)
    else {
      await sleep(3000)
      const r = await js(`(() => { const w = window.__windSheet, L = w.layout, R = L.span / 2 - 2 * L.mPerTexel, c = [L.origin[0] + L.span / 2, L.origin[1] + L.span / 2]
        const pts = []; for (let i = 0; i < 16; i++) { const a = i * 2.39996, d = R * Math.sqrt((i + 0.5) / 16); pts.push([c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d]) }
        const dead = window.__samplerCensus().filter((x) => !x.linked).map((x) => x.material)
        return JSON.stringify({ dead, status: w.status, air: w.air, L, probe: w.probeAir(pts) }) })()`).then(JSON.parse)
      if (r.dead.length) fails.push(`${r.dead.length} program(s) did not link: ${r.dead.join(', ')}`)
      let worst = 0
      for (const p of r.probe) {
        const err = Math.hypot(p.gpu[0] - p.cpu[0], p.gpu[1] - p.cpu[1]), mag = Math.hypot(p.cpu[0], p.cpu[1])
        const tol = 0.02 + 2e-3 * mag   // half-float carries ~11 bits
        worst = Math.max(worst, err / tol)
        if (err > tol) fails.push(`GPU air ≠ CPU windAt at (${p.x.toFixed(0)}, ${p.z.toFixed(0)}): gpu [${p.gpu.map((v) => v.toFixed(3))}] cpu [${p.cpu.map((v) => v.toFixed(3))}]`)
      }
      const moving = r.probe.some((p) => Math.hypot(p.cpu[0], p.cpu[1]) > 0.05)
      console.log(`  ${TOWN}: sheet ${r.L.size}² at ${r.L.mPerTexel.toFixed(2)} m/texel · weather ${r.status.weather} · ${r.air.baseSpeedMps.toFixed(1)} m/s, gusts +${r.air.gustsScale.toFixed(1)} · 16 points, worst error ${(worst * 100).toFixed(0)}% of tolerance`)
      if (!moving) console.warn('  ⚠️ the air is calm at every point — the comparison only proved two zeros agree; run when the town has wind')
    }
    ws.close()
  } finally { cleanup() }
}

if (fails.length) {
  console.error(`\n⛔ (${fails.length}):`)
  for (const f of fails) console.error(`   ${f}`)
  process.exit(1)
}
console.log(`\n✅ one wind: the sheet is the town's weather through wind-field.js's one field${STATIC_ONLY ? ' (static only)' : ', and the GPU draws what the CPU computes'}`)
process.exit(0)
