#!/usr/bin/env node
/**
 * "DOES A SIGN PICK ITS BUILDING — AND ONLY ITS BUILDING?" — BRIEF-neon-reads-at-every-distance §3.4.
 *
 * WHY (2026-10-06). A click on a wall or a roof selected its building; a click on its NEON selected nothing — the sign
 * was drawn on the building but was not part of it. Ruled (Jacob): "the whole building and whatever eventually gets
 * stuck to it is part of the selectable surface". The line is drawn in screen space, so it is picked in screen space
 * (NeonBands.jsx#PICK_SLOP_PX) — which is exactly how it could steal clicks from the ground around it.
 *
 * A RUNTIME check: headless Chrome (a throwaway profile) drives STAGE on the running dev server (Preview has no
 * selection), with EVERY non-GET request FAILED — nothing can be saved. Camera pinned at an oblique view of one
 * building; Stage's session-only Neon on; real mouse events. Asserts: a click on a wall, on the roof and on the neon
 * each select that building, and a click on EMPTY GROUND — a point at grade whose ray meets no building, by the
 * scene's own raycast — selects nothing.
 * ⛔ It reads what the dev server SERVES (the main tree).
 *
 *   node checks/claims-neon-picks-its-building.mjs --town=<town> [--on=<building id>]
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requiredTown } from './_scenes.mjs'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = requiredTown('town'), MODE = 'clicks', WHEN = arg('when', '2026-10-10T01:00:00Z')
let ON = arg('on', null)
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

await cdp('Page.navigate', { url: `${BASE}/cartograph.html?scene=${TOWN}&look=${TOWN}&shot=browse` }, S)
let ok = false
for (let i = 0; i < 240 && !ok; i++) { await sleep(500); ok = await js(`!!(window.__scene && window.__camera)`).catch(() => false) }
if (!ok) { console.log(`  ❌ FAIL  Stage never drew (${pageErrors.join(' | ') || 'no page error'})`); cleanup(); process.exit(1) }
await js(IMP)
await js(`(async () => {
  const tod = (await window.__imp('/src/hooks/useTimeOfDay.js')).default.getState(); tod.setTime(new Date(${JSON.stringify(WHEN)})); tod.setPaused?.(true)
  const st = (await window.__imp('/src/cartograph/stores/useCartographStore.js')).default.getState(); st.setNeonForceOn(true)
  return true })()`)
await sleep(4000)
// The building, from the slab index the page itself built.
let entry = null
for (let i = 0; i < 120 && !entry; i++) { await sleep(500); entry = await js(`(async () => { const m = await window.__imp('/src/hooks/useSlabBuildingIndex.js'); const idx = m.default.getState().index; if (!idx) return null
  // --on, else the first building that carries an address face and a wall long enough to aim at
  const per = (f) => f.reduce((a, p, i) => a + Math.hypot(f[(i + 1) % f.length][0] - p[0], f[(i + 1) % f.length][1] - p[1]), 0)
  // --on, else the first building with a long enough wall that carries DRAWN neon — a stretch with no place on it is
  // not drawn, so the slab's faces alone do not say where a sign is
  let line = null; window.__scene.traverse(o => { if (o.isMesh && String(o.material?.customProgramCacheKey?.() || '').startsWith('neon-bands-line')) line = o })
  if (!line) return null
  // the drawn segments' midpoints, bucketed once (a town has thousands of buildings and segments)
  const A = line.geometry.attributes.aA.array, CELL = 50, grid = new Map()
  for (let v = 0; v < A.length / 3; v += 4) { const k = Math.floor(A[v*3] / CELL) + ',' + Math.floor(A[v*3+2] / CELL); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([A[v*3], A[v*3+2]]) }
  const drawnNear = (f) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of f) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
    for (let i = Math.floor((x0 - 1.5) / CELL); i <= Math.floor((x1 + 1.5) / CELL); i++) for (let j = Math.floor((z0 - 1.5) / CELL); j <= Math.floor((z1 + 1.5) / CELL); j++)
      for (const [x, z] of grid.get(i + ',' + j) || []) if (x > x0 - 1.5 && x < x1 + 1.5 && z > z0 - 1.5 && z < z1 + 1.5) return true
    return false }
  const e = ${JSON.stringify(ON)} ? idx.byId.get(${JSON.stringify(ON)}) : idx.byNum.find((e) => e.ranges?.wall && e.footprint && per(e.footprint) > 60 && drawnNear(e.footprint))
  return e ? { id: e.id, footprint: e.footprint, baseY: e.baseY, centroidY: e.centroidY, neon: e.neon } : null })()`) }
ON = entry?.id ?? ON
if (!entry) { console.log(`  ❌ FAIL  the slab building index never arrived${ON ? ` (or has no ${ON})` : ' (or no building carries drawn neon)'} — the check has no subject. Page errors: ${pageErrors.join(' | ') || 'none'}`); cleanup(); process.exit(1) }

// Pin an oblique view: out from the building's longest wall, looking at its middle.
const fp = entry.footprint
let cx = 0, cz = 0; for (const [x, z] of fp) { cx += x / fp.length; cz += z / fp.length }
let li = 0, ll = 0; for (let i = 0; i < fp.length; i++) { const a = fp[i], b = fp[(i + 1) % fp.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > ll) { ll = L; li = i } }
const a = fp[li], b = fp[(li + 1) % fp.length], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2
let nx = mx - cx, nz = mz - cz; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl
const pose = await js(`(async () => {
  const sc = window.__scene, cam = window.__camera, ctl = window.__controls
  let ex = 1; sc.traverse(o => { if (o.material?.uniforms?.uExag) ex = o.material.uniforms.uExag.value })
  const gy = ${entry.centroidY} * ex, top = gy + ${entry.baseY}
  const g = [${cx}, gy + ${entry.baseY} * 0.5, ${cz}], p = [${mx} + ${nx} * ${DIST}, top + ${UP}, ${mz} + ${nz} * ${DIST}]
  const freeze = (vec) => { const P = Object.getPrototypeOf(vec)
    for (const k of Object.getOwnPropertyNames(P)) { if (typeof P[k] !== 'function' || k === 'constructor' || k === 'clone' || /^(get|equals|distance|length|dot|toArray|manhattan|angle)/.test(k)) continue
      vec[k] = function (...a) { return window.__pin.on ? this : P[k].apply(this, a) } } }
  if (!window.__pin) { window.__pin = {}; freeze(cam.position); if (ctl) freeze(ctl.target) }
  window.__pin.on = false
  cam.position.set(...p); if (ctl) ctl.target.set(...g); cam.lookAt(...g); cam.updateProjectionMatrix()
  window.__pin.on = true
  return { ex, gy, top }
})()`)
await sleep(1500)
const frames = `(n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })`
const sel = (id) => js(`(async () => { const s = (await window.__imp('/src/hooks/useSelectedBuilding.js')).default.getState(); ${id ? `s.select(${JSON.stringify(id)})` : 's.deselect()'}; await (${frames})(20); return true })()`)
const selected = () => js(`(async () => (await window.__imp('/src/hooks/useSelectedBuilding.js')).default.getState().selectedId)()`)

if (MODE === 'clicks') {
  // Screen points: a wall (the long wall's middle, half height), the roof (centroid, at the eave), the neon (its first
  // stretch's middle, at the eave), and empty ground (well out in front of the wall, at grade).
  const targets = {
    wall:   [mx + nx * 0.05, pose.gy + entry.baseY * 0.5, mz + nz * 0.05],
    roof:   [cx, pose.top - 0.05, cz],
    // EMPTY GROUND = a point at grade whose ray meets NO building (by the scene's own raycast) — the question is whether
    // anything else (the neon's screen-space pick) claims a click there.
    ground: await js(`(() => {
      const st = window.__scene.__r3f.root.getState(), cam = window.__camera, V = cam.position.constructor
      const bld = []; window.__scene.traverse(o => { if (o.isMesh && String(o.material?.customProgramCacheKey?.() || '').startsWith('slab-bldg')) bld.push(o) })
      for (let d = 6; d < 4 * ${DIST}; d += 2) {
        const p = new V(${mx} + ${nx} * d, ${pose.gy}, ${mz} + ${nz} * d), v = p.clone().project(cam)
        if (Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9) continue
        st.raycaster.setFromCamera({ x: v.x, y: v.y }, cam)
        if (!st.raycaster.intersectObjects(bld, false).length) return [p.x, p.y, p.z]
      }
      return null })()`),
  }
  const results = {}
  for (const [what, p] of Object.entries(targets)) {
    if (!p) { results[what] = 'no target'; continue }
    await sel(null)
    const xy = p.xy ?? await js(`(() => { const cam = window.__camera, V = cam.position.constructor, c = window.__renderer.domElement, r = c.getBoundingClientRect()
      const v = new V(${p[0]}, ${p[1]}, ${p[2]}).project(cam); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height] })()`)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: xy[0], y: xy[1], button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 }, S)
    await sleep(600)
    results[what] = { at: xy.map(Math.round), selected: await selected() }
  }
  // ⭐ THE NEON TARGET MUST BE ONE ONLY THE SIGN CAN ANSWER: a pixel within the sign's pick reach (NeonBands.jsx's
  // linePx/2 + PICK_SLOP_PX, read from the modules) whose ray meets NO building mesh by the scene's own raycast — else a
  // click "on the neon" lands on the wall or roof behind it, and the check passes with the pick removed (it did,
  // 2026-10-06). So the camera stands LOW, out from a segment the line mesh actually DREW, looking up at it: the sign is
  // seen against the sky, and the search steps up the screen from it. No such pixel → the check fails, loudly.
  const segs = await js(`(() => { let line = null; window.__scene.traverse(o => { if (o.isMesh && String(o.material?.customProgramCacheKey?.() || '').startsWith('neon-bands-line')) line = o })
    if (!line) return []
    const LA = line.geometry.attributes.aA.array, LB = line.geometry.attributes.aB.array, f = ${JSON.stringify(fp)}
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of f) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
    const out = []; for (let v = 0; v < LA.length / 3; v += 4) if (LA[v*3] > x0 - 1.5 && LA[v*3] < x1 + 1.5 && LA[v*3+2] > z0 - 1.5 && LA[v*3+2] < z1 + 1.5) out.push([LA[v*3], LA[v*3+1], LA[v*3+2], LB[v*3], LB[v*3+2]])
    return out })()`)
  results.neon = 'no target'
  if (process.env.NEON_DEBUG) console.log('drawn segments near', ON, segs.length, JSON.stringify(segs.slice(0, 2)))
  for (const [ax, ay, az, bx, bz] of segs.slice(0, 8)) {
    const sx = (ax + bx) / 2, sz = (az + bz) / 2, sy = ay + pose.gy
    let ox = sx - cx, oz = sz - cz; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol
    // a LOW pose out from the segment with a clear line of sight to it (no building between — a neighbour can stand there)
    let clear = false
    for (const d of [12, 18, 25, 35, 50]) for (const side of [0, 0.5, -0.5]) {
      if (clear) break
      const px = sx + (ox + side * -oz) * d, pz = sz + (oz + side * ox) * d, py = pose.gy + entry.baseY * 0.3
      clear = await js(`(() => { window.__pin.on = false; const cam = window.__camera, ctl = window.__controls, V = cam.position.constructor
        cam.position.set(${px}, ${py}, ${pz}); if (ctl) ctl.target.set(${sx}, ${sy}, ${sz}); cam.lookAt(${sx}, ${sy}, ${sz}); cam.updateProjectionMatrix(); cam.updateMatrixWorld()
        window.__pin.on = true
        const st = window.__scene.__r3f.root.getState(), to = new V(${sx}, ${sy}, ${sz}), dist = cam.position.distanceTo(to)
        st.raycaster.set(cam.position.clone(), to.clone().sub(cam.position).normalize())
        const bld = []; window.__scene.traverse(o => { if (o.isMesh && String(o.material?.customProgramCacheKey?.() || '').startsWith('slab-bldg')) bld.push(o) })
        const h = st.raycaster.intersectObjects(bld, false)[0]
        return !h || h.distance > dist - 0.6 })()`)
    }
    if (!clear) continue
    await sleep(800)
    const xy = await js(`(async () => {
      const { PICK_SLOP_PX } = await window.__imp('/src/components/NeonBands.jsx')
      const { neon: U } = await window.__imp('/src/preview/neonState.js')
      const st = window.__scene.__r3f.root.getState(), cam = window.__camera, V = cam.position.constructor, c = window.__renderer.domElement, rect = c.getBoundingClientRect()
      const bld = []; window.__scene.traverse(o => { if (o.isMesh && String(o.material?.customProgramCacheKey?.() || '').startsWith('slab-bldg')) bld.push(o) })
      const v = new V(${sx}, ${sy}, ${sz}).project(cam), a = [(v.x + 1) / 2 * c.width, (1 - v.y) / 2 * c.height]
      const reachPx = U.linePxUniform.value / 2 + PICK_SLOP_PX - 1   // inside the reach, never on its edge
      for (let o = 1; o <= reachPx; o++) {
        const px = [a[0], a[1] - o]
        st.raycaster.setFromCamera({ x: px[0] / c.width * 2 - 1, y: -(px[1] / c.height * 2 - 1) }, cam)
        const hits = st.raycaster.intersectObjects(bld, false)
        if (!hits.length) return [rect.left + px[0] * rect.width / c.width, rect.top + px[1] * rect.height / c.height]
        if (o === 1) window.__dbgHit = { d: hits[0].distance, key: hits[0].object.material?.customProgramCacheKey?.(), a, cam: cam.position.toArray().map(Math.round) }
      }
      return null })()`)
    if (process.env.NEON_DEBUG) console.log('seg', [sx, sy, sz].map(Math.round), '→', xy, await js(`JSON.stringify(window.__dbgHit || null)`))
    if (!xy) continue
    if (process.env.NEON_DEBUG) console.log('raycast at the target:', await js(`(() => {
      const st = window.__scene.__r3f.root.getState(), cam = window.__camera, c = window.__renderer.domElement, rect = c.getBoundingClientRect()
      let line = null; window.__scene.traverse(o => { if (o.isMesh && String(o.material?.customProgramCacheKey?.() || '').startsWith('neon-bands-line')) line = o })
      const px = [(${xy[0]} - rect.left) * c.width / rect.width, (${xy[1]} - rect.top) * c.height / rect.height]
      st.raycaster.setFromCamera({ x: px[0] / c.width * 2 - 1, y: -(px[1] / c.height * 2 - 1) }, cam)
      const hits = []; line.raycast(st.raycaster, hits)
      const all = st.raycaster.intersectObjects(window.__scene.children, true).slice(0, 3).map(h => (h.object.material?.customProgramCacheKey?.() || h.object.type) + '@' + h.distance.toFixed(1))
      return JSON.stringify({ customRaycast: String(line.raycast).includes('PICK_SLOP') || String(line.raycast).includes('reach'), handlers: Object.keys(line.__r3f?.handlers || {}), lineHits: hits.length, firstHits: all, exag: window.__terrainExag.value, rcCamera: !!st.raycaster.camera })
    })()`))
    await sel(null)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: xy[0], y: xy[1], button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 }, S)
    await sleep(600)
    results.neon = { at: xy.map(Math.round), selected: await selected() }
    break
  }
  let failed = 0
  const check = (ok, what, detail = '') => { console.log(`  ${ok ? '✅ pass' : '❌ FAIL'}  ${what}${!ok && detail ? `\n           ${detail}` : ''}`); if (!ok) failed++ }
  console.log(`${TOWN} · ${ON} · ${WHEN}`)
  for (const k of ['wall', 'roof']) check(results[k]?.selected === ON, `a click on its ${k} selects ${ON}`, `selected: ${JSON.stringify(results[k])}`)
  check(results.neon !== 'no target' && results.neon?.selected === ON, `a click on its neon — where no building is under the cursor — selects ${ON}`,
    results.neon === 'no target' ? 'no point on its sign has empty background within the pick reach — choose another --on' : `selected: ${JSON.stringify(results.neon)}`)
  check(results.ground !== 'no target' && results.ground?.selected == null, 'a click on empty ground selects nothing', `selected: ${JSON.stringify(results.ground)}`)
  check(blocked.length === 0, 'nothing tried to save', blocked.slice(0, 3).join(' · '))
  if (pageErrors.length) console.log('  page errors:', pageErrors.slice(0, 5))
  console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed')
  cleanup(); process.exit(failed ? 1 : 0)
}
