#!/usr/bin/env node
/**
 * "IS WHAT YOU CLICK WHAT YOU SEE — THE SAME IN HERO AND IN BROWSE?" — BRIEF-neon-reads-at-every-distance §3.4.
 *
 * WHY (Jacob, 2026-10-06: "it's the actual clickable surface" · "in hero and browse, should be the same"). The shader
 * lifts every building onto the terrain; the raycast tested the UN-lifted geometry, so the clickable building sat
 * aCentroidY × uExag below the drawn one. Measured in the Ward on Huron, Hero (exag 1): a drawn roof selected nothing,
 * and empty ground under the building selected it. Browse runs exag 0, so there the two coincided — hence "Hero and
 * Browse differ". Fixed by a pick copy carrying the drawn positions (src/lib/buildingLift.js, SlabBuildings.jsx).
 *
 * A RUNTIME check: headless Chrome (a throwaway profile) drives STAGE on the running dev server — both shots reachable
 * there — with EVERY non-GET request FAILED (nothing can be saved). Per shot, per building (default: the two walled
 * buildings with the most terrain lift — where a mismatch is largest), a pinned oblique camera and real clicks:
 *   - the drawn WALL and the drawn ROOF each select the building;
 *   - Hero and Browse give the same answers;
 *   - the GHOST — where the wall would be with no lift — selects nothing wherever the lift is ≥ 2 px on screen.
 * ⛔ It reads what the dev server SERVES (the main tree).
 *
 *   node checks/claims-a-click-hits-what-is-drawn.mjs [--town=huron] [--on=<id>,<id>] [--shots=hero,browse]
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = arg('town', 'huron'), WHEN = arg('when', '2026-10-10T12:00:00Z'), SHOTS = arg('shots', 'hero,browse').split(',')
let ONS = arg('on', null)?.split(',') ?? null
const BASE = arg('base', 'http://localhost:5173'), DIST = Number(arg('dist', '60')), UP = Number(arg('up', '35'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'neon-select-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error(e); cleanup(); process.exit(1) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map(); const pageErrors = []
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300)) }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
// ⛔ Nothing may be saved: every non-GET request is failed (Stage autosaves design.json).
const blocked = []
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, S)
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method !== 'Fetch.requestPaused') return
  const r = m.params.request
  if (r.method !== 'GET') { blocked.push(`${r.method} ${r.url}`); cdp('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }, S).catch(() => {}) }
  else cdp('Fetch.continueRequest', { requestId: m.params.requestId }, S).catch(() => {}) })
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800)); return r.result?.value }

// ⭐ IMPORT WHAT THE PAGE IMPORTED. Vite serves a module edited during the dev server's session as `…?t=<stamp>`, and a
// bare `import('/src/…')` from here then gets a SECOND, empty instance of a store — the index read null on Huron while
// the page had it (2026-10-06, after useSlabBuildingIndex.js was touched). `window.__imp` resolves the URL the page loaded.
const IMP = `window.__imp = (p) => { const u = performance.getEntriesByType('resource').map((r) => r.name).find((n) => { try { return new URL(n).pathname === p } catch { return false } }); return import(u ?? p) }; true`


const results = {}
for (const SHOT of SHOTS) {
  await cdp('Page.navigate', { url: `${BASE}/cartograph.html?scene=${TOWN}&look=${TOWN}&shot=${SHOT}` }, S)
  let ok = false
  for (let i = 0; i < 240 && !ok; i++) { await sleep(500); ok = await js(`!!(window.__scene && window.__camera && window.__scene.__r3f)`).catch(() => false) }
  if (!ok) { console.log(`  ❌ FAIL  Stage (${SHOT}) never drew (${pageErrors.join(' | ') || 'no page error'})`); cleanup(); process.exit(1) }
  await js(IMP)
  await js(`(async () => { const tod = (await window.__imp('/src/hooks/useTimeOfDay.js')).default.getState(); tod.setTime(new Date(${JSON.stringify(WHEN)})); tod.setPaused?.(true); return true })()`)
  // the shot's exag tween settles before anything is measured
  let prev = null, exag = null
  for (let i = 0; i < 60; i++) { await sleep(500); exag = await js(`window.__terrainExag.value`); if (prev != null && Math.abs(exag - prev) < 1e-5 && i > 6) break; prev = exag }
  const ents = await js(`(async () => { let idx = null; for (let i = 0; i < 120 && !idx; i++) { idx = (await window.__imp('/src/hooks/useSlabBuildingIndex.js')).default.getState().index; if (!idx) await new Promise(r => setTimeout(r, 500)) }
    if (!idx) return null
    const per = (f) => f.reduce((a, p, i) => a + Math.hypot(f[(i + 1) % f.length][0] - p[0], f[(i + 1) % f.length][1] - p[1]), 0)
    const want = ${JSON.stringify(ONS)}
    const pickd = want ? want.map(id => idx.byId.get(id)).filter(Boolean)
      : idx.byNum.filter(e => e.ranges?.wall && e.footprint && per(e.footprint) > 40).sort((a, b) => b.centroidY - a.centroidY).slice(0, 2)
    return pickd.map(e => ({ id: e.id, footprint: e.footprint, baseY: e.baseY, centroidY: e.centroidY })) })()`)
  if (!ents || !ents.length) { console.log(`  ❌ FAIL  ${SHOT}: the slab building index never arrived, or holds none of ${JSON.stringify(ONS) ?? 'the walled buildings'} — the check has no subject. Page errors: ${pageErrors.join(' | ') || 'none'}`); cleanup(); process.exit(1) }
  ONS = ents.map(e => e.id)
  results[SHOT] = { exag }
  for (const e of ents) {
    const fp = e.footprint
    let cx = 0, cz = 0; for (const [x, z] of fp) { cx += x / fp.length; cz += z / fp.length }
    let li = 0, ll = 0; for (let i = 0; i < fp.length; i++) { const a = fp[i], b = fp[(i + 1) % fp.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > ll) { ll = L; li = i } }
    const a = fp[li], b = fp[(li + 1) % fp.length], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2
    let nx = mx - cx, nz = mz - cz; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl
    const lift = e.centroidY * exag
    // the same world camera in every shot, relative to the DRAWN building
    await js(`(() => { const cam = window.__camera, ctl = window.__controls
      const g = [${cx}, ${lift + e.baseY * 0.5}, ${cz}], p = [${mx + nx * 50}, ${lift + e.baseY + 30}, ${mz + nz * 50}]
      const freeze = (vec) => { const P = Object.getPrototypeOf(vec)
        for (const k of Object.getOwnPropertyNames(P)) { if (typeof P[k] !== 'function' || k === 'constructor' || k === 'clone' || /^(get|equals|distance|length|dot|toArray|manhattan|angle)/.test(k)) continue
          vec[k] = function (...a) { return window.__pin.on ? this : P[k].apply(this, a) } } }
      if (!window.__pin) { window.__pin = {}; freeze(cam.position); if (ctl) freeze(ctl.target) }
      window.__pin.on = false; cam.position.set(...p); if (ctl) ctl.target.set(...g); cam.lookAt(...g); cam.updateProjectionMatrix(); window.__pin.on = true; return true })()`)
    await sleep(1200)
    // roof: the footprint vertex-average can fall outside an L; take the point inside the ring nearest it
    const inR = (x, z) => { let o = false; for (let i = 0, j = fp.length - 1; i < fp.length; j = i++) { const [xi, zi] = fp[i], [xj, zj] = fp[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) o = !o } return o }
    let rx = cx, rz = cz
    if (!inR(rx, rz)) { let best = Infinity; for (let i = 0; i < fp.length; i++) for (let t = 0.1; t < 1; t += 0.2) { const p = fp[i], q = fp[(i + 2) % fp.length], x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t; if (inR(x, z)) { const d = Math.hypot(x - cx, z - cz); if (d < best) { best = d; rx = x; rz = z } } } }
    const targets = {
      wall:  [mx + nx * 0.05, lift + e.baseY * 0.6, mz + nz * 0.05],
      roof:  [rx, lift + e.baseY - 0.05, rz],
      ghost: [mx + nx * 0.05, e.baseY * 0.6, mz + nz * 0.05],
    }
    const r = { lift: +lift.toFixed(2) }
    for (const [what, p] of Object.entries(targets)) {
      await js(`(async () => { (await window.__imp('/src/hooks/useSelectedBuilding.js')).default.getState().deselect(); return true })()`)
      const xy = await js(`(() => { const cam = window.__camera, V = cam.position.constructor, c = window.__renderer.domElement, rc = c.getBoundingClientRect()
        const v = new V(${p[0]}, ${p[1]}, ${p[2]}).project(cam); return [rc.left + (v.x + 1) / 2 * rc.width, rc.top + (1 - v.y) / 2 * rc.height] })()`)
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: xy[0], y: xy[1], button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 }, S)
      await sleep(500)
      r[what] = await js(`(async () => (await window.__imp('/src/hooks/useSelectedBuilding.js')).default.getState().selectedId)()`)
    }
    // the lift on screen, in px, at the wall: is the ghost distinguishable from the wall here?
    r.liftPx = await js(`(() => { const cam = window.__camera, V = cam.position.constructor, c = window.__renderer.domElement
      const a = new V(${targets.wall[0]}, ${targets.wall[1]}, ${targets.wall[2]}).project(cam), b = new V(${targets.ghost[0]}, ${targets.ghost[1]}, ${targets.ghost[2]}).project(cam)
      return +(Math.hypot((a.x - b.x) / 2 * c.width, (a.y - b.y) / 2 * c.height)).toFixed(1) })()`)
    results[SHOT][e.id] = r
  }
}
let failed = 0
const check = (ok, what, detail = '') => { console.log(`  ${ok ? '✅ pass' : '❌ FAIL'}  ${what}${!ok && detail ? `\n           ${detail}` : ''}`); if (!ok) failed++ }
console.log(`${TOWN} · ${SHOTS.map(s => `${s} exag ${results[s].exag}`).join(' · ')}`)
for (const id of ONS) {
  for (const s of SHOTS) {
    const r = results[s][id]
    check(r.wall === id, `${s}: a click on ${id}'s drawn wall selects it`, `selected ${r.wall} (lift ${r.lift} m)`)
    check(r.roof === id, `${s}: a click on ${id}'s drawn roof selects it`, `selected ${r.roof} (lift ${r.lift} m)`)
    if (r.liftPx >= 2) check(r.ghost == null, `${s}: a click where ${id} would be WITHOUT its lift (${r.liftPx} px below) selects nothing`, `selected ${r.ghost}`)
  }
  if (SHOTS.length > 1) {
    const [s0, s1] = SHOTS
    check(results[s0][id].wall === results[s1][id].wall && results[s0][id].roof === results[s1][id].roof,
      `${id}: ${s0} and ${s1} give the same answers`, JSON.stringify({ [s0]: results[s0][id], [s1]: results[s1][id] }))
  }
}
check(blocked.length === 0, 'nothing tried to save', blocked.slice(0, 3).join(' · '))
if (pageErrors.length) console.log('  page errors:', pageErrors.slice(0, 5))
console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed')
cleanup(); process.exit(failed ? 1 : 0)
