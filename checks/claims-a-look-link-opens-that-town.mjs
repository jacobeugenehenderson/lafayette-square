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
 * And a COLD Stage (no link, nothing stored) opens NO town: no Look, no scene, no town's data fetched, and the Look
 * picker shows every town to choose from (Jacob's standing order: LS is never the fallback).
 * ⭐ AND THE PAGE'S INSTANCE IS THAT TOWN (BRIEF-no-default-town, 2026-09-28): ?scene=huron opened huron in the store
 * while src/instance.js's INSTANCE stayed Lafayette Square — so Stage handed <Town> LS's listings and every neon on huron
 * drew UNKNOWN slate. Asserted: under ?scene=<town>, INSTANCE is that town's Look and the listings' buildings exist in
 * that town's slab; a cold Stage has INSTANCE null.
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
let seq = 0; const pending = new Map(); const errs = new Map(); const townFetches = new Map(); const thrown = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Fetch.requestPaused') { const r = m.params.request
    const t = r.url.match(/\/api\/cartograph\/([a-z0-9-]+)\/(skeleton|centerlines|overlay|markers|measurements|ribbons|geography|boundary)\b/)
    if (t) townFetches.get(m.sessionId)?.push(t[1])
    cdp(r.method === 'GET' ? 'Fetch.continueRequest' : 'Fetch.failRequest', r.method === 'GET' ? { requestId: m.params.requestId } : { requestId: m.params.requestId, errorReason: 'BlockedByClient' }, m.sessionId).catch(() => {}) }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.get(m.sessionId)?.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '))
  if (m.method === 'Runtime.exceptionThrown') thrown.get(m.sessionId)?.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text) }

// Open a URL in a fresh tab (fresh storage: a throwaway profile, each tab's storage cleared first) and read the store.
async function open(query, pick = null, page = 'cartograph.html') {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  errs.set(S, []); townFetches.set(S, []); thrown.set(S, [])
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, S)
  await cdp('Runtime.enable', {}, S); await cdp('Page.enable', {}, S)
  await cdp('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' }, S)
  await cdp('Page.navigate', { url: `${BASE}/${page}?${query}` }, S)
  let st = null
  for (let i = 0; i < 40; i++) {
    await sleep(1000)
    const r = await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => { const u = performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('/stores/useCartographStore.js')).pop(); if (!u) return null; const s = (await import(u)).default.getState(); return { activeLookId: s.activeLookId, scene: s.scene, looks: s._looksHydrated } })()` }, S).catch(() => null)
    st = r?.result?.value
    if (st?.looks) { await sleep(3000); st = (await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => { const u = performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('/stores/useCartographStore.js')).pop(); const s = (await import(u)).default.getState(); return { activeLookId: s.activeLookId, scene: s.scene, looks: s._looksHydrated } })()` }, S)).result.value; break }
  }
  // Optionally choose a town from the picker, then read the store again.
  let picked = null
  if (pick) {
    await cdp('Runtime.evaluate', { expression: `[...document.querySelectorAll('.carto-looks-option')].find(b => b.textContent.includes(${JSON.stringify(pick)}))?.click()` }, S)
    await sleep(12000)
    picked = (await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => { const u = performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('/stores/useCartographStore.js')).pop(); const s = (await import(u)).default.getState(); return { activeLookId: s.activeLookId, scene: s.scene } })()` }, S)).result.value
  }
  // The page's INSTANCE and the listings Stage hands <Town>.
  const inst = (await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const n = performance.getEntriesByType('resource').map(e => e.name)
    const im = n.filter(u => /\\/src\\/instance\\.js/.test(u)).pop(), lm = n.filter(u => /\\/hooks\\/useListings\\.js/.test(u)).pop()
    const out = {}
    try { out.instance = im ? ((await import(im)).INSTANCE?.lookId ?? null) : 'not loaded' } catch (e) { out.instance = 'ERR ' + e.message }
    try { out.buildingIds = lm ? (await import(lm)).default.getState().listings.filter(l => !l._bare).map(l => l.building_id).filter(Boolean) : [] } catch (e) { out.buildingIds = [] }
    return out })()` }, S).catch(() => null))?.result?.value ?? {}
  const exceptions = thrown.get(S)
  const e = errs.get(S), fetched = [...new Set(townFetches.get(S))]
  const picker = await cdp('Runtime.evaluate', { returnByValue: true, expression: `[...document.querySelectorAll('.carto-looks-option')].map(b => b.textContent.trim())` }, S).then(r => r.result.value).catch(() => null)
  await cdp('Target.closeTarget', { targetId })
  return { st, errors: e, fetched, picker, picked, exceptions, instance: inst.instance, buildingIds: inst.buildingIds || [] }
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
// ⭐ ?scene=<town>: the page's INSTANCE is that town, and so are the listings Stage draws with.
{
  const t = towns.find(x => x.id === 'huron') || towns.find(x => x.scene !== 'lafayette-square')
  const { st, instance, buildingIds } = await open(`scene=${t.scene}`)
  const slab = new Set(JSON.parse(await (await fetch(`${BASE}/baked/${t.id}/buildings.json`)).text()).buildings.map(b => b.id))
  const inSlab = buildingIds.filter(id => slab.has(id)).length
  const ok = st?.activeLookId === t.id && instance === t.id && buildingIds.length > 0 && inSlab === buildingIds.length
  if (!ok) fails.push(`?scene=${t.scene} opened look "${st?.activeLookId}" with INSTANCE "${instance}" — ${inSlab} of ${buildingIds.length} listing building(s) exist in ${t.id}'s slab: Stage draws one town with another's content`)
  console.log(`${ok ? '✅' : '⛔'} ?scene=${t.scene} → look ${st?.activeLookId} · INSTANCE ${instance} · listings in its slab ${inSlab}/${buildingIds.length}`)
}
// The cold boot: no link, nothing stored.
{
  const { st, fetched, picker, instance } = await open('')
  const names = towns.map(t => t.name || t.id)
  const shown = (picker || []).filter(p => names.some(n => p.includes(n)))
  const ok = st?.activeLookId == null && st?.scene == null && !fetched.length && shown.length === towns.length && instance == null
  if (!ok) fails.push(`a cold Stage (no link, nothing stored) opened look "${st?.activeLookId}" scene "${st?.scene}" with INSTANCE "${instance}", fetched ${fetched.length ? fetched.join(', ') + "'s data" : 'no town'}, picker shows ${shown.length} of ${towns.length} towns — it must open none and offer them all`)
  console.log(`${ok ? '✅' : '⛔'} cold Stage → look ${st?.activeLookId} · scene ${st?.scene} · INSTANCE ${instance} · fetched [${fetched.join(', ')}] · picker ${shown.length}/${towns.length}`)
  // ...and choosing a town from that picker opens it.
  const t = towns.find(x => x.scene !== 'lafayette-square') || towns[0]
  const { picked, errors, exceptions } = await open('', t.name || t.id)
  const ok2 = picked?.activeLookId === t.id && picked?.scene === t.scene
  if (!ok2) fails.push(`choosing "${t.name || t.id}" from the cold picker opened look "${picked?.activeLookId}" scene "${picked?.scene}"`)
  // A THROWN exception is a crash (the blank page this check found twice). Console errors are the app speaking —
  // listed, not failed: a town's own data warnings are not this check's subject.
  if (exceptions.length) fails.push(`the cold Stage threw ${exceptions.length} exception(s): ${exceptions.slice(0, 2).map(x => x.slice(0, 140)).join(' | ')}`)
  console.log(`${ok2 && !exceptions.length ? '✅' : '⛔'} cold Stage, choose ${t.id} → look ${picked?.activeLookId} · scene ${picked?.scene} · ${exceptions.length} exception(s)`)
  for (const x of errors) console.log(`   ⓘ console error: ${x.slice(0, 160)}`)
}
// A cold Preview (no ?look=, nothing stored): no town drawn — the chooser offers them all.
{
  const { instance, picker, exceptions } = await open('', null, 'preview')
  const names = towns.map(t => t.name || t.id)
  const shown = (picker || []).filter(p => names.some(n => p.includes(n)))
  const ok = instance == null && shown.length === towns.length && !exceptions.length
  if (!ok) fails.push(`a cold Preview drew INSTANCE "${instance}" and offered ${shown.length} of ${towns.length} towns${exceptions.length ? ` (${exceptions.length} exception(s))` : ''} — it must draw none and offer them all`)
  console.log(`${ok ? '✅' : '⛔'} cold Preview → INSTANCE ${instance} · chooser ${shown.length}/${towns.length} · ${exceptions.length} exception(s)`)
}
ws.close(); cleanup()
if (fails.length) { console.log(`\n⛔ FAIL — ${fails.length}\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log(`\n✅ every ?look= link opens that town; a bad link resolves none and says so`)
process.exit(0)
