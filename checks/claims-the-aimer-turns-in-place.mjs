#!/usr/bin/env node
/**
 * "DOES ⇧-DRAG TURN THE CAMERA IN PLACE, WITH THE GRABBED DIRECTION UNDER THE CURSOR, AND NOTHING ELSE?"
 *
 * WHY (BRIEF-the-aimer-turns-the-camera-in-place; Jacob, 2026-10-29: "plant it and point it"). The orbit regime's aimer
 * (cameraRegimes.js#aimInPlace + #applyAim, mounted by RegimeControls) turns the camera about its own position. Silent
 * failure here is a camera that drifts while it aims (an orbit wearing the aimer's name), a grabbed point that slides off
 * the cursor toward the frame's edge (a delta solve), a mount's limits that OrbitControls then enforces by MOVING the
 * camera, a roll, or OrbitControls hearing the press.
 *
 * Judged on the SOURCE: the aimer block is read out of cameraRegimes.js and run (so a mutant of it is judged by the same
 * code), on three-stdlib's OrbitControls built with REGIMES.orbit (read, never restated):
 *   1 pure rotation     — Δposition ≤ 1e-9 m and roll ≤ 1e-9 after the drag and OrbitControls' update()
 *   2 under the cursor  — the grabbed direction lands on the cursor pixel within TOL_PX, at the frame's CENTRE and its
 *                         EDGE (a pure rotation is depth-blind, so depth is no test; the edge is where a delta solve errs)
 *   3 the mount's limits — on a mount whose maxPolarAngle binds, the pitch stops at it and the camera still does not move
 *   4 refusals          — an `up` that is not world +Y, a vertical grab, an unreachable cursor: { skip }, nothing moves
 *   5 the clamp         — RegimeControls swallows the ⇧ press BEFORE asking whether the mount may turn (so a no-rotate
 *                         mount's press never falls through to OrbitControls' own ⇧-pan, nor a pen arriving as touch)
 *   6 the lean's premise — OrbitControls measures polar about the camera's CURRENT up (re-read every update()); a
 *                         three-stdlib that changes this goes RED here (cameraRegimes.js, the overhead regime's note)
 * TOL_PX: the solve is closed-form, so the cursor error is float64 noise (judge 2 prints it per case); 1e-6 px sits far
 * above that and far below the smallest mutant error (--mutants prints the delta solve's error per case).
 * ⭐ MUTANTS (--mutants), each must go RED: (a) the target dragged instead of turned (an orbit) · (b) a delta solve ·
 *   (c) the pitch clamp as constants, not the mount's limits · (d) the up refusal removed · (e) the no-root refusal
 *   removed · (f) the clamp after the rotate gate · (g) the vertical-grab refusal removed.
 * ⭐ LIVE (--live --town=<town> [--base=http://localhost:5173]): headless Chrome on Stage's Hero, with EVERY non-GET
 *   request FAILED (nothing can save), real input events:
 *   7 ⇧-drag (mouse) turns the view and the camera stands still · 8 ⇧ held on the keyboard + a pen arriving as TOUCH
 *   does the same (OrbitControls would tumble a touch) · 9 PLANT, POINT, PLAY: aim, Key here, orbit away, click the key:
 *   the played view is the aimed one, within capture's whole-metre rounding (StageApp#captureCameraSnapshot).
 *   It waits for the town's reveal (its splash takes the pointer until then). The server must serve the town's baked
 *   slab (public/baked is not in a fresh worktree). Seen RED 2026-10-29 with the ⇧ clamp removed: 5, 7 and 8.
 *   node checks/claims-the-aimer-turns-in-place.mjs [--mutants] [--live --town=<town> [--base=…]]
 * Read-only. Exits 1 on any failing judge or any mutant left GREEN; 2 when the live run cannot run.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { OrbitControls } from 'three-stdlib'
import { REGIMES } from '../src/lib/cameraRegimes.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = 'src/lib/cameraRegimes.js', MOUNT = 'src/components/RegimeControls.jsx'
const read = (f) => readFileSync(join(ROOT, f), 'utf8')
const TOL_PX = 1e-6, TOL_M = 1e-9
const W = 1600, H = 900

// The aimer block, out of the source: from its banner to the next export the file declares after applyAim.
const block = (src) => {
  const a = src.indexOf('// ── The aimer'), b = src.indexOf('/** The per-mount keys')
  if (a < 0 || b < a) return null
  return new Function('THREE', src.slice(a, b).replace(/^export /gm, '') + '\nreturn { aimInPlace, applyAim }')(THREE)
}

const dom = { style: {}, addEventListener() {}, removeEventListener() {}, ownerDocument: { addEventListener() {}, removeEventListener() {} }, clientWidth: W, clientHeight: H }
function rig(P, look, limits = {}) {
  const cam = new THREE.PerspectiveCamera(22, W / H, 1, 1e5)
  cam.position.set(...P); cam.updateProjectionMatrix()
  const c = new OrbitControls(cam, dom)
  for (const [k, v] of Object.entries(REGIMES.orbit)) if (k !== 'mouseButtons' && k !== 'touches') c[k] = v
  Object.assign(c, limits)
  c.target.set(...look); cam.lookAt(c.target); c.update()
  return c
}
const ndcOf = (px, py) => ({ x: (px / W) * 2 - 1, y: -(py / H) * 2 + 1 })
const rayOf = (cam, px, py) => { cam.updateMatrixWorld(); const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(ndcOf(px, py).x, ndcOf(px, py).y), cam); return r.ray.direction.clone() }
const pixelOf = (cam, dir) => { cam.updateMatrixWorld(); const p = cam.position.clone().addScaledVector(dir, 1000).project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H] }
const roll = (cam) => new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ').z

// One drag: grab at `from`, cursor to `to` (through `steps` moves, as RegimeControls' onMove does).
function drag(A, c, from, to, steps = 8) {
  const dir = typeof from === 'function' ? from(c) : rayOf(c.object, ...from)
  const dist = c.target.distanceTo(c.object.position)
  const at = A.aimInPlace(c.object, dir, ndcOf(...(Array.isArray(from) ? from : to)), c.minPolarAngle, c.maxPolarAngle)
  if (at.skip) return { skip: at.skip }
  for (let i = 1; i <= steps; i++) {
    const f = Array.isArray(from) ? from : to
    const px = f[0] + (to[0] - f[0]) * i / steps, py = f[1] + (to[1] - f[1]) * i / steps
    const t = A.aimInPlace(c.object, dir, ndcOf(px, py), c.minPolarAngle, c.maxPolarAngle)
    if (t.skip) return { skip: t.skip }
    A.applyAim(c, t, dist)
  }
  return { dir }
}

function judgeAimer(A) {
  const out = [], rows = {}
  if (!A) return { out: [`no aimer block in ${HOME} (the banner "// ── The aimer" … "/** The per-mount keys")`], rows }
  // 1 + 2: a centre drag and an edge drag, LS-scale, and the brief's 190 m apex at ~2 km
  const cases = [
    ['centre (800,450)→(1000,450)', [0, 30, 0], [400, 0, -900], [800, 450], [1000, 450]],
    ['edge (1500,100)→(1300,150)', [0, 30, 0], [400, 0, -900], [1500, 100], [1300, 150]],
    ['apex at 2 km → upper middle', [-1500, 40, 1300], [-1200, 0, 1000], (c) => new THREE.Vector3(0, 190, 0).sub(c.object.position).normalize(), [800, 200]],
  ]
  for (const [name, P, look, from, to] of cases) {
    const c = rig(P, look), P0 = c.object.position.clone()
    const r = drag(A, c, from, to)
    if (r.skip) { out.push(`${name}: refused a reachable aim (${r.skip})`); continue }
    const moved = c.object.position.distanceTo(P0), rl = Math.abs(roll(c.object)), [x, y] = pixelOf(c.object, r.dir), err = Math.hypot(x - to[0], y - to[1])
    rows[name] = err
    if (moved > TOL_M) out.push(`${name}: the camera MOVED ${moved.toExponential(2)} m (an aim is a turn in place)`)
    if (rl > TOL_M) out.push(`${name}: roll ${rl.toExponential(2)} (up must stay vertical)`)
    if (err > TOL_PX) out.push(`${name}: the grab lands ${err.toFixed(3)} px from the cursor`)
  }
  // 3: lab-like mount (maxPolarAngle 0.499π): drag the apex to the bottom edge — the pitch binds, nothing moves
  {
    const lim = { maxPolarAngle: Math.PI * 0.499 }, c = rig([-1500, 40, 1300], [-1200, 0, 1000], lim), P0 = c.object.position.clone()
    const r = drag(A, c, (cc) => new THREE.Vector3(0, 190, 0).sub(cc.object.position).normalize(), [800, 880])
    const pitch = new THREE.Euler().setFromQuaternion(c.object.quaternion, 'YXZ').x, cap = lim.maxPolarAngle - Math.PI / 2
    if (r.skip) out.push(`the mount's limit: refused instead of stopping at it (${r.skip})`)
    else {
      if (c.object.position.distanceTo(P0) > TOL_M) out.push(`the mount's limit: OrbitControls MOVED the camera ${c.object.position.distanceTo(P0).toExponential(2)} m (the pitch left the mount's polar range)`)
      if (pitch > cap + 1e-9) out.push(`the mount's limit: pitch ${(pitch * 180 / Math.PI).toFixed(3)}° past the mount's ${(cap * 180 / Math.PI).toFixed(3)}°`)
    }
  }
  // 4: refusals — tilted up · vertical grab · unreachable cursor
  {
    const c = rig([0, 30, 0], [400, 0, -900]); c.object.up.set(0, 0, -1)
    if (!A.aimInPlace(c.object, rayOf(c.object, 900, 450), ndcOf(900, 450), 0, Math.PI).skip) out.push('a camera whose up is not world +Y was turned (it would roll)')
    const c2 = rig([0, 30, 0], [400, 0, -900])
    if (!A.aimInPlace(c2.object, new THREE.Vector3(0, 1, 0), ndcOf(800, 450), 0, Math.PI).skip) out.push('a vertical grab was turned (it has no heading)')
    // the zenith, grabbed 1° short of vertical, asked to sit at the frame's right edge: a cursor ray that far off the
    // vertical centre line never climbs that high at any pitch (no roll), so no pitch reaches it
    const z = new THREE.Vector3(Math.sin(Math.PI / 180), Math.cos(Math.PI / 180), 0)
    if (!A.aimInPlace(c2.object, z, ndcOf(1599, 450), 0, Math.PI).skip) out.push('a cursor no pitch can reach was answered (it must be skipped, not clamped or flung)')
  }
  return { out, rows }
}

let bad = 0
const live = judgeAimer(block(read(HOME)))
console.log(`${live.out.length ? '⛔' : '✅'} 1–4 the aimer turns in place, the grab under the cursor (${Object.entries(live.rows).map(([k, v]) => `${k}: ${v.toExponential(1)} px`).join(' · ')}), inside the mount's limits, refusing what it cannot do`)
for (const w of live.out) console.log(`      ⛔ ${w}`)
if (live.out.length) bad++

// 5: the clamp, from the mount's source
const judgeMount = (src) => {
  const m = src.match(/if \(shift\) \{([\s\S]*?)\n {6}\}/)
  if (!m) return ['RegimeControls has no ⇧ branch in the orbit effect']
  const sp = m[1].indexOf('e.stopPropagation()'), gate = m[1].indexOf('c.enableRotate')
  if (sp < 0) return ['the ⇧ press is never swallowed: OrbitControls hears it (its own ⇧-pan, or a pen as touch)']
  if (gate >= 0 && gate < sp) return ['the ⇧ press is swallowed only AFTER the rotate gate: on a no-rotate mount it falls through to OrbitControls']
  if (!/addEventListener\('pointerdown', onDown, true\)/.test(src)) return ['onDown is not on the capture phase: OrbitControls hears the press first']
  return []
}
const M = judgeMount(read(MOUNT))
console.log(`${M.length ? '⛔' : '✅'} 5 the ⇧ press is swallowed before OrbitControls, on every mount`)
for (const w of M) console.log(`      ⛔ ${w}`)
if (M.length) bad++

// 6: OrbitControls' polar is about the CURRENT up
{
  const cam = new THREE.PerspectiveCamera(22, W / H, 1, 1e5); cam.up.set(0, 0, -1); cam.position.set(0, 1000, 0.01); cam.lookAt(0, 0, 0)
  const c = new OrbitControls(cam, dom)
  cam.up.set(0, 1, 0); cam.position.set(-800, 120, 600); c.target.set(0, 0, 0); cam.lookAt(0, 0, 0)
  c.maxPolarAngle = Math.PI * 0.45; c.update()
  const polar = Math.acos(cam.position.y / cam.position.length())
  const ok = Math.abs(polar - c.maxPolarAngle) < 1e-9
  console.log(`${ok ? '✅' : '⛔'} 6 OrbitControls measures polar about the camera's CURRENT up (built under (0,0,−1), switched to +Y: polar ${(polar * 180 / Math.PI).toFixed(3)}°, limit 81°)`)
  if (!ok) bad++
}

// ── MUTANTS ──────────────────────────────────────────────────────────────────
if (process.argv.includes('--mutants')) {
  const res = []
  const verdict = (name, ran, red, extra = '') => { res.push(`${name}: ${!ran ? '⛔ not run (the site moved — re-aim the mutant)' : red ? `RED, as it must be${extra}` : '⛔ still GREEN'}`); if (!ran || !red) bad++ }
  const hs = read(HOME)
  const mut = (name, from, to, test) => { const s = hs.replace(from, to); const r = s !== hs ? judgeAimer(block(s)) : null; verdict(name, s !== hs, r && test(r), r?.out.length ? ` (${r.out[0].slice(0, 80)})` : '') }
  // (a) an orbit: the camera swung about the target instead of the target turned about the camera
  mut('a · the target dragged, not turned (an orbit)',
    /controls\.target\.copy\(cam\.position\)\.addScaledVector\(_aimF\.set\(0, 0, -1\)\.applyQuaternion\(cam\.quaternion\), dist\)/,
    'const _q = cam.quaternion.clone(); cam.position.copy(controls.target).addScaledVector(_aimF.set(0, 0, -1).applyQuaternion(_q), -dist)',
    (r) => r.out.some(w => /MOVED/.test(w)))
  // (b) a delta solve: pitch and yaw from the cursor's pixel offset (fov / height per pixel), not from the two rays
  mut('b · a delta solve',
    /export function aimInPlace\(camera, grabDir, ndc, polarMin, polarMax\) \{/,
    `export function aimInPlace(camera, grabDir, ndc, polarMin, polarMax) {
  { const k = THREE.MathUtils.degToRad(camera.fov) / 2, l = grabDir.clone().applyQuaternion(camera.quaternion.clone().invert())
    const gx = Math.atan2(l.x, -l.z), gy = Math.atan2(l.y, Math.hypot(l.x, l.z)), e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    return { pitch: e.x + gy - ndc.y * k, yaw: e.y - gx + ndc.x * k * camera.aspect } }`,
    (r) => r.out.some(w => /edge.*px from the cursor/.test(w)))
  // (c) the pitch clamp as constants instead of the mount's limits
  mut('c · the pitch clamp as constants',
    /Math\.max\(polarMin, AIM_EPS\) - Math\.PI \/ 2, Math\.min\(polarMax, Math\.PI - AIM_EPS\) - Math\.PI \/ 2/,
    'AIM_EPS - Math.PI / 2, Math.PI / 2 - AIM_EPS',
    (r) => r.out.some(w => /mount's limit/.test(w)))
  // (d) the up refusal removed · (e) the no-root refusal removed
  mut('d · the up refusal removed', /return \{ skip: `camera\.up is/, 'if (false) return { skip: `camera.up is', (r) => r.out.some(w => /up is not world/.test(w)))
  mut('g · the vertical-grab refusal removed', /if \(Math\.hypot\(grabDir\.x, grabDir\.z\) < AIM_EPS\) return/, 'if (false) return', (r) => r.out.some(w => /vertical grab/.test(w)))
  mut('e · the no-root refusal removed', /if \(Math\.abs\(grabDir\.y\) > R\) return/, 'if (false) return', (r) => r.out.some(w => /no pitch can reach/.test(w)))
  // (f) the clamp moved after the rotate gate
  const ms = read(MOUNT), mf = ms.replace(/(if \(shift\) \{\n\s*)e\.stopPropagation\(\)([^\n]*)\n(\s*)if \(!e\.isPrimary \|\| !c\.enableRotate\) return/,
    '$1if (!e.isPrimary || !c.enableRotate) return\n$3e.stopPropagation()$2')
  verdict('f · the clamp after the rotate gate', mf !== ms, judgeMount(mf).length > M.length)
  // the delta mutant's margin, centre and edge (E4: recorded so the gap to TOL_PX is visible)
  const dl = judgeAimer(block(hs.replace(/export function aimInPlace\(camera, grabDir, ndc, polarMin, polarMax\) \{/, `export function aimInPlace(camera, grabDir, ndc, polarMin, polarMax) {
  { const k = THREE.MathUtils.degToRad(camera.fov) / 2, l = grabDir.clone().applyQuaternion(camera.quaternion.clone().invert())
    const gx = Math.atan2(l.x, -l.z), gy = Math.atan2(l.y, Math.hypot(l.x, l.z)), e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    return { pitch: e.x + gy - ndc.y * k, yaw: e.y - gx + ndc.x * k * camera.aspect } }`)))
  for (const r of res) console.log(`   mutant ${r}`)
  console.log(`   the delta mutant's error: ${Object.entries(dl.rows).map(([k, v]) => `${k} ${v.toFixed(2)} px`).join(' · ')} (TOL_PX ${TOL_PX})`)
}
// ── LIVE ─────────────────────────────────────────────────────────────────────
if (process.argv.includes('--live')) {
  const { spawn } = await import('node:child_process')
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { requiredTown } = await import('./_scenes.mjs')
  const town = requiredTown('town')
  const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) ?? 'http://localhost:5173'
  const profile = mkdtempSync(join(tmpdir(), 'aimer-'))
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1400,900', '--enable-gpu', 'about:blank'], { stdio: 'ignore' })
  const cleanup = () => { try { chrome.kill('SIGKILL') } catch {}; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
  process.on('exit', cleanup)
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
  const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let seq = 0, S; const pending = new Map(), blocked = [], errors = []
  const cdp = (method, params = {}, sid = S) => new Promise((res, rej) => { const id = ++seq; pending.set(id, m => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
    if (m.method === 'Fetch.requestPaused') {
      const r = m.params.request
      if (r.method !== 'GET') { blocked.push(r.url.replace(BASE, '')); cdp('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {}) }
      else cdp('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => {})
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200))
  }
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' }, null)
  S = (await cdp('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  await cdp('Runtime.enable'); await cdp('Page.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.navigate', { url: `${BASE}/cartograph.html?scene=${town}` })
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value }
  await sleep(20000)
  const mod = (part) => `(await import(performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('${part}')).pop()))`
  const STORE = `${mod('/stores/useCartographStore.js')}.default`
  const loaded = await ev(`(async () => (${STORE}).getState().activeLookId)()`)
  const cannot = (why) => { console.log(`⛔ LIVE NOT RUN — ${why}${errors.length ? ` · exceptions: ${JSON.stringify(errors.slice(0, 2))}` : ''}`); ws.close(); cleanup(); process.exit(2) }
  if (loaded !== town) cannot(`asked for "${town}", Stage loaded "${loaded}"`)
  await ev(`(async () => { (${STORE}).getState().setShot('hero') })()`)
  // The town's splash covers the page (pointer events on) until the town is revealed: wait for the reveal, never a timer.
  let revealed = false
  for (let i = 0; i < 180 && !revealed; i++) { await sleep(1000); revealed = await ev(`performance.getEntriesByName('ward:reveal').length > 0 && !document.querySelector('[data-town-splash]')`).catch(() => false) }
  if (!revealed) cannot('the town never revealed in Stage (its splash still covers the page) — the check saw nothing')
  await sleep(2000)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Camera$/.test(b.textContent.trim())); b?.click(); return !!b })()`); await sleep(2500)
  const view = () => ev(`(async () => { const c = ${mod('/stage/cameraBridge.js')}.cameraState; return { position: [...c.position], target: [...c.target], fov: c.fov } })()`)
  const canvas = await ev(`(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
  const cx = canvas.x + canvas.w / 2, cy = canvas.y + canvas.h / 2
  const look = (v) => { const d = v.target.map((t, i) => t - v.position[i]), l = Math.hypot(...d); return d.map(x => x / l) }
  const angle = (a, b) => Math.acos(Math.min(1, Math.max(-1, look(a).reduce((s, v, i) => s + v * look(b)[i], 0)))) * 180 / Math.PI
  const same = (a, b) => a.position.every((v, i) => v === b.position[i])
  const SHIFT = 8
  const mouse = (type, x, y, m = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, modifiers: m, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' })
  const mdrag = async (x0, y0, x1, y1, m) => { await mouse('mousePressed', x0, y0, m); for (let i = 1; i <= 20; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20, m); await sleep(25) } await mouse('mouseReleased', x1, y1, m); await sleep(800) }
  const L = []
  const row = (ok, msg) => { L.push(ok); console.log(`${ok ? '✅' : '⛔'} ${msg}`); if (!ok) bad++ }
  // 7 — ⇧-drag with a mouse
  let v0 = await view()
  await mdrag(cx, cy, cx - canvas.w * 0.25, cy + canvas.h * 0.1, SHIFT)
  let v1 = await view()
  row(same(v0, v1) && angle(v0, v1) > 1, `7 ⇧-drag (mouse): the camera stands at ${JSON.stringify(v1.position)} (was ${JSON.stringify(v0.position)}) and the view turned ${angle(v0, v1).toFixed(2)}°`)
  // 8 — ⇧ held on the keyboard, a pen arriving as touch (no modifier flags on the pointer)
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: SHIFT })
  v0 = await view()
  const tp = (type, x, y) => cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  await tp('touchStart', cx, cy); for (let i = 1; i <= 20; i++) { await tp('touchMove', cx + canvas.w * 0.2 * i / 20, cy); await sleep(25) } await tp('touchEnd'); await sleep(800)
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 0 })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false })
  v1 = await view()
  row(same(v0, v1) && angle(v0, v1) > 1, `8 ⇧ held + a touch drag: the camera stands at ${JSON.stringify(v1.position)} (was ${JSON.stringify(v0.position)}) and the view turned ${angle(v0, v1).toFixed(2)}°`)
  // 9 — plant, point, play
  const aimed = await view()
  const keyBtn = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /^(Replace|Add the view|Key this)/.test(b.title || '')); if (!b) return null; b.click(); return b.title })()`)
  if (!keyBtn) cannot('no Key here button in the Camera card')
  await sleep(1000)
  const keys = await ev(`(async () => (${STORE}).getState().heroKeyframes)()`)
  const key = keys.find(k => k.position.every((v, i) => v === aimed.position[i]) && angle(aimed, k) < 1e-9 + 0.5)
  await mdrag(cx, cy, cx + canvas.w * 0.2, cy, 0)   // orbit away (plain drag)
  const away = await view()
  const at = keys.indexOf(key)
  const markers = await ev(`(() => [...document.querySelectorAll('div')].filter(d => d.className?.includes?.('touch-none') && d.className.includes('h-6')).map(t => [...t.children].filter(c => c.title && !/again/.test(c.title)).map(c => { const b = c.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2] })).find(m => m.length === ${keys.length}))()`)
  if (!key || !markers) cannot(`the aimed view was not keyed (${keyBtn}; keys ${JSON.stringify(keys.map(k => k.position))}) or no timeline markers`)
  await mouse('mousePressed', ...markers[at]); await mouse('mouseReleased', ...markers[at]); await sleep(1500)
  const played = await view()
  const dA = angle(aimed, played), dP = Math.hypot(...aimed.position.map((v, i) => v - played.position[i]))
  row(dP <= Math.sqrt(3) && dA < 0.5 && played.fov === aimed.fov && angle(away, aimed) > 1,
    `9 plant, point, play: keyed (${keyBtn}), orbited ${angle(away, aimed).toFixed(2)}° away, played key ${at + 1}: position Δ ${dP.toFixed(2)} m, look Δ ${dA.toFixed(3)}°, fov ${played.fov}/${aimed.fov} (capture rounds to whole metres) · aimed ${JSON.stringify(aimed)} · played ${JSON.stringify(played)}`)
  console.log(`   non-GET requests blocked (nothing saved): ${blocked.length}${blocked.length ? ` — ${[...new Set(blocked)].slice(0, 3).join(', ')}` : ''}${errors.length ? ` · page exceptions: ${JSON.stringify(errors.slice(0, 2))}` : ''}`)
  ws.close(); cleanup()
}
console.log(bad ? '\n⛔ RED — the aimer moves the camera, lets the grab slide, fights the mount, turns what it must refuse, or lets OrbitControls hear ⇧'
  : '\n✅ GREEN — ⇧-drag turns the camera in place, the grab under the cursor, inside the mount\'s limits')
process.exit(bad ? 1 : 0)
