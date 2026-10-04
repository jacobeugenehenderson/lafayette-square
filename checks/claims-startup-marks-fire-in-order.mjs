#!/usr/bin/env node
/**
 * "DOES A COLD LOAD MARK THE SPEC'S STARTUP SEQUENCE, IN ORDER, AND ONLY FOR WHAT WAS DRAWN?"
 *
 * WHY (Phase 2 E, BRIEF-phase2-E-preview-measurement.md): TIME TO WARD is read off invisible anchors
 * (src/lib/startupMarks.js, src/components/DrawnAnchor.jsx) that the shared renderer sets as it crosses each boundary:
 * runtime → manifest → ground → buildings → FIRST TRUTHFUL FRAME (= WARD USABLE) → trees. Preview's startup gauge and
 * the Ward read the same marks, so a mark that fires early or on a mount instead of a draw lies to both.
 *
 * RUNTIME: headless Chrome, a throwaway profile, against the running kit dev server; Preview, cold, for --town.
 *
 * Asserts:
 *   1. a cold load sets every mark; runtime ≤ manifest ≤ first-truthful-frame; first-truthful-frame ≥ ground and
 *      ≥ buildings; each mark is set once.
 *   2. ⭐ THE INSTRUMENT CAN FAIL: the same load with Preview's Ground layer hidden (`preview.layers.v3`, ground off)
 *      draws no ground, so it must set NO ground mark and NO first-truthful-frame, while buildings still mark. If
 *      the anchor marked on a mount or a fetch, this leg would pass the town as usable with no ground on screen.
 *   3. The residency gauge (src/preview/Residency.jsx) moves with what is shown: ground geometry is resident in both
 *      loads, VISIBLE > 0 with the ground on and exactly 0 with it hidden.
 *   4. The GL ledger (src/preview/glLedger.js) counts what is allocated, to the byte: a 512×512 RGBA8 texture adds
 *      1,048,576 bytes and its delete takes them away; a 4,096-byte bufferData adds 4,096; a JSON parse is recorded.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-startup-marks-fire-in-order.mjs [--town=lafayette-square] [--base=http://localhost:5173]
 */
import { spawn, execSync } from 'node:child_process'
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

// One cold load in a fresh tab, with `layers` written to Preview's inspection store first. Returns { id: [ms…] }.
async function coldLoad(layers, waitFor) {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
  await cdp('Network.enable', {}, S); await cdp('Network.setCacheDisabled', { cacheDisabled: true }, S)
  const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S)).result?.value
  // The layer store is written before any of the page's own scripts run, so Preview reads it on its first render.
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.layers.v3', ${JSON.stringify(JSON.stringify(layers))}); localStorage.setItem('preview.mode.v1', 'desktop')` }, S)
  await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
  const stored = async () => { for (let i = 0; i < 20; i++) { const v = await js(`localStorage.getItem('preview.layers.v3')`); if (v) return v; await sleep(250) } return null }
  if ((await stored()) !== JSON.stringify(layers)) { fails.push(`the layer store never took ${JSON.stringify(layers)}: the leg proves nothing`) }
  const read = () => js(`(() => { const o = {}; for (const e of performance.getEntriesByType('mark')) if (e.name.startsWith('ward:')) (o[e.name.slice(5)] ||= []).push(e.startTime); return o })()`)
  let marks = {}
  for (let i = 0; i < 90; i++) {
    await sleep(1000)
    marks = (await read()) || {}
    if (waitFor.every((k) => marks[k])) break
  }
  await sleep(3000)   // let anything that would (wrongly) fire late have its chance
  marks = (await read()) || {}
  const residency = await js('window.__residency && window.__residency()')
  const ledger = layers.ground === false ? null : await js(`(async () => {
    const L = window.__glLedger(), sum = (m) => [...m.values()].reduce((s, e) => s + e.bytes, 0)
    const gl = document.createElement('canvas').getContext('webgl2')
    const t0 = sum(L.textures), b0 = sum(L.buffers), p0 = L.parses.length
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 512, 512)
    const tAdd = sum(L.textures) - t0
    gl.deleteTexture(t)
    const tDel = sum(L.textures) - t0
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, 4096, gl.STATIC_DRAW)
    const bAdd = sum(L.buffers) - b0
    gl.deleteBuffer(b)
    await (await fetch(location.origin + '/baked/${TOWN}/manifest.json')).json()
    return { tAdd, tDel, bAdd, parsed: L.parses.length - p0 }
  })()`)
  await cdp('Target.closeTarget', { targetId })
  return { ...marks, __residency: residency, __ledger: ledger }
}

const ALL = ['runtime', 'manifest', 'ground', 'buildings', 'first-truthful-frame', 'trees']
const ms = (m, k) => m[k]?.[0]
const piece = (m, id) => m.__residency?.pieces?.find((p) => p.piece === id)
const show = (m) => ALL.map((k) => `${k} ${m[k] ? Math.round(ms(m, k)) + 'ms' : '—'}`).join(' · ')

// ── 1. a cold load marks the sequence, in order ──
const a = await coldLoad({}, ALL)
console.log(`  ${TOWN}, all layers: ${show(a)}`)
for (const k of ALL) {
  if (!a[k]) fails.push(`${k} never marked on a cold load`)
  else if (a[k].length !== 1) fails.push(`${k} marked ${a[k].length} times (once per page)`)
}
const order = (x, y) => { if (a[x] && a[y] && ms(a, x) > ms(a, y)) fails.push(`${x} (${Math.round(ms(a, x))}ms) after ${y} (${Math.round(ms(a, y))}ms)`) }
order('runtime', 'manifest'); order('manifest', 'first-truthful-frame'); order('ground', 'first-truthful-frame'); order('buildings', 'first-truthful-frame')

// ── 2. the instrument can fail: no ground drawn → no ground mark, no truthful frame ──
const b = await coldLoad({ ground: false }, ['buildings'])
console.log(`  ${TOWN}, ground hidden: ${show(b)}`)
if (!b.buildings) fails.push('ground hidden: buildings never marked — the leg proves nothing')
if (b.ground) fails.push('ground hidden, yet ground marked: the anchor marks a mount, not a draw')
if (b['first-truthful-frame']) fails.push('ground hidden, yet FIRST TRUTHFUL FRAME marked: a town with no ground on screen was called usable')

// ── 3. residency follows what is shown ──
const ga = piece(a, 'ground'), gb = piece(b, 'ground')
console.log(`  residency, ground geometry: shown ${ga ? `${ga.resident} B resident, ${ga.visible} B visible` : '—'} · hidden ${gb ? `${gb.resident} B resident, ${gb.visible} B visible` : '—'}`)
if (!ga?.resident || !ga.visible) fails.push('ground shown, yet the residency gauge reports no resident or no VISIBLE ground geometry')
if (!gb?.resident) fails.push('ground hidden: no resident ground geometry — the toggle unmounted it, or the gauge cannot see it')
else if (gb.visible !== 0) fails.push(`ground hidden, yet VISIBLE ground = ${gb.visible} B: the gauge counts what is held, not what is shown`)

// ── 4. the GL ledger counts allocations to the byte ──
const L = a.__ledger
console.log(`  ledger: texture +${L?.tAdd} / after delete ${L?.tDel} · buffer +${L?.bAdd} · parses +${L?.parsed}`)
if (!L) fails.push('the GL ledger is not installed on the page (window.__glLedger)')
else {
  if (L.tAdd !== 1048576) fails.push(`a 512×512 RGBA8 texture added ${L.tAdd} B, not 1,048,576`)
  if (L.tDel !== 0) fails.push(`deleting it left ${L.tDel} B in the ledger`)
  if (L.bAdd !== 4096) fails.push(`a 4,096-byte buffer added ${L.bAdd} B`)
  if (L.parsed !== 1) fails.push(`a Response.json() recorded ${L.parsed} parses, not 1`)
}

if (fails.length) { console.error(`⛔ startup marks (${TOWN}):\n  - ${fails.join('\n  - ')}`); done(1) }
console.log(`✅ startup marks (${TOWN}): every boundary marked once, in order; a hidden ground marks neither ground nor the truthful frame, and reads 0 VISIBLE; the GL ledger counts to the byte`)
done(0)
