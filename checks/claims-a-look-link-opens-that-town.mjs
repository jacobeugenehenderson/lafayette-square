#!/usr/bin/env node
/**
 * "DOES A ?look= LINK OPEN THAT TOWN — AND NEVER THE DEFAULT ONE?"
 *
 * WHY (measured 2026-09-28): in a fresh profile cartograph.html?look=huron opened LAFAYETTE SQUARE. The store's scene
 * booted to the default installation (no ?scene=, nothing stored), and the Looks load then aligned the Look to that
 * scene — so a deep link named one town and Stage edited another, quietly. Layer 0's fallback to town #1.
 *
 * RUNTIME, headless Chrome with a throwaway profile against the running dev server; every non-GET request is failed
 * (nothing is saved). For every Look in the served index that has a scene: ?look=<id> settles on activeLookId <id>
 * and that Look's scene. And the two refusals: a ?look= naming no Look, and a ?look= whose scene disagrees with
 * ?scene=, each resolve NO town and log an error naming what was asked — never the default town.
 *
 * Usage: node checks/claims-a-look-link-opens-that-town.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const idx = await (await fetch(`${BASE}/api/cartograph/looks`)).json()
const towns = idx.looks.filter(l => l.scene)
if (!towns.length) { console.log('⛔ CANNOT RUN — the served Looks index has no Look with a scene'); process.exit(2) }

const profile = mkdtempSync(join(tmpdir(), 'look-link-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup)
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map(); const errs = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Fetch.requestPaused') { const r = m.params.request; cdp(r.method === 'GET' ? 'Fetch.continueRequest' : 'Fetch.failRequest', r.method === 'GET' ? { requestId: m.params.requestId } : { requestId: m.params.requestId, errorReason: 'BlockedByClient' }, m.sessionId).catch(() => {}) }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.get(m.sessionId)?.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ')) }

// Open a URL in a fresh tab (fresh storage: a throwaway profile, each tab's storage cleared first) and read the store.
async function open(query) {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  errs.set(S, [])
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, S)
  await cdp('Runtime.enable', {}, S); await cdp('Page.enable', {}, S)
  await cdp('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' }, S)
  await cdp('Page.navigate', { url: `${BASE}/cartograph.html?${query}` }, S)
  let st = null
  for (let i = 0; i < 40; i++) {
    await sleep(1000)
    const r = await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => { const u = performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('/stores/useCartographStore.js')).pop(); if (!u) return null; const s = (await import(u)).default.getState(); return { activeLookId: s.activeLookId, scene: s.scene, looks: s._looksHydrated } })()` }, S).catch(() => null)
    st = r?.result?.value
    if (st?.looks) { await sleep(3000); st = (await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => { const u = performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('/stores/useCartographStore.js')).pop(); const s = (await import(u)).default.getState(); return { activeLookId: s.activeLookId, scene: s.scene, looks: s._looksHydrated } })()` }, S)).result.value; break }
  }
  const e = errs.get(S)
  await cdp('Target.closeTarget', { targetId })
  return { st, errors: e }
}

const fails = []
for (const l of towns) {
  const { st } = await open(`look=${encodeURIComponent(l.id)}`)
  const ok = st?.activeLookId === l.id && st?.scene === l.scene
  if (!ok) fails.push(`?look=${l.id} opened look "${st?.activeLookId}" scene "${st?.scene}" — expected "${l.id}" / "${l.scene}"`)
  console.log(`${ok ? '✅' : '⛔'} ?look=${l.id} → look ${st?.activeLookId} · scene ${st?.scene}`)
}
// The refusals: no town, and an error that names what was asked.
const other = towns.find(t => t.scene !== towns[0].scene)
const refusals = [['look=no-such-look', ['no-such-look']]]
if (other) refusals.push([`look=${towns[0].id}&scene=${other.scene}`, [towns[0].id, other.scene]])
for (const [q, names] of refusals) {
  const { st, errors } = await open(q)
  const loud = errors.some(e => names.every(n => e.includes(n)))
  const ok = st?.activeLookId == null && loud
  if (!ok) fails.push(`?${q} settled on look "${st?.activeLookId}" scene "${st?.scene}"${loud ? '' : ' with no error naming ' + names.join(' + ')} — it must resolve no town and say why`)
  console.log(`${ok ? '✅' : '⛔'} ?${q} → look ${st?.activeLookId} · ${loud ? 'refused loudly' : 'NO error naming it'}`)
}
ws.close(); cleanup()
if (fails.length) { console.log(`\n⛔ FAIL — ${fails.length}\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log(`\n✅ every ?look= link opens that town; a bad link resolves none and says so`)
process.exit(0)
