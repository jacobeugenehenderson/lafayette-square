// Frame census (Sigil, 2026-11-01 night; BRIEF-a-frame-budget-for-every-shot §1–§4). READ-ONLY: drives the running :5173
// Preview headless, Grain's harness (scratch/tree-cost/probe.mjs: Page.enable + addScriptToEvaluateOnNewDocument for the tier),
// and mutates only the page's memory (visibility toggles, pixel ratio).
//
//   node scratch/frame-census/census.mjs --town=<look> --mode=desktop|phone-hi --shot=browse|hero [--close]
//
// Per CLASS (read off the scene graph's town:* groups and the materials, never off a town's names):
//   trees · ground (+ its AO lightmap, which is a texture on the ground draw, not a draw of its own) · water · lamps ·
//   buildings · displays (set-piece lighting, the Light Show, neon) · sky.
// For each: DRAWN (shown meshes, instances, triangles) · IN FRUSTUM (per instance for instanced meshes, the instance's bounding
// sphere through instanceMatrix; for merged meshes, the share of a vertex sample inside the frustum) · VISIBLE (of a sample of
// in-frustum points: not occluded by the opaque ground or buildings — a THREE.Raycaster from the camera, so trees and lamps
// are NOT counted as occluders — and larger than one pixel) · Δgpu ms when the class is hidden (frameCost.js#gpuWindow).
// Then the frame's GPU ms at pixel ratio ×1 and ×0.5: whether cost tracks pixels (fill) or not (geometry).
// ⛔ Tree instance y is a sentinel (the lift is in the shader): an instance's centre is lifted by its aGroundRaw.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir, loadavg } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = arg('town', 'lafayettesquare'), MODE = arg('mode', 'desktop'), SHOT = arg('shot', 'browse'), CLOSE = process.argv.includes('--close')
const BASE = arg('base', 'http://localhost:5173'), SAMPLE = +arg('sample', '400')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'frame-census-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error(e); cleanup(); process.exit(1) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid && { sessionId: sid }) })) })
const pageErrors = []
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push('ERR ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)) }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.mode.v1', '${MODE}'); localStorage.setItem('cartograph-last-stage-shot', '${SHOT}')` }, S)
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value }
const t0 = Date.now()
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)

const M = (n) => (n / 1e6).toFixed(2) + 'M'
const log = []; const say = (s) => { console.log(s); log.push(s) }
say(`== ${TOWN} · ${SHOT}${CLOSE ? ' (close)' : ''} · ${MODE} · headless Chrome, this desktop's GPU · load ${loadavg().map((x) => x.toFixed(2)).join(' ')} ==`)

// ARRIVAL: wait for the renderer, then for the scene to settle (draw count stable for 6 s).
let ready = false, lastCalls = -1, stableFor = 0
for (let s = 0; s < 120; s++) {
  await sleep(1000)
  const ok = await js(`!!(window.__scene && window.__renderer && window.__camera && window.__previewFrame)`).catch(() => false)
  if (!ok) continue
  const f = await js(`window.__previewFrame()`)
  if (f.calls === lastCalls) stableFor++; else stableFor = 0
  lastCalls = f.calls
  if (stableFor >= 6) { ready = true; say(`  settled at t+${((Date.now() - t0) / 1000).toFixed(0)}s (${f.calls} draws stable 6 s)`); break }
}
if (!ready) say('  ⛔ never settled within 120 s; numbers below are NOT steady state')
const dead = pageErrors.filter((x) => /SHADER DID NOT LINK/.test(x))
if (dead.length) { dead.forEach((x) => say('  ⛔ ' + x)); say('  ⛔ a shader did not link — every number would describe an empty draw'); cleanup(); process.exit(1) }

// Install the in-page census, using three classes reached through a dynamic import of the app's own three module.
await js(`(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\\/node_modules\\/\\.vite\\/deps\\/three\\.js|\\/three\\.module\\.js|\\/deps\\/three/.test(n))
  window.__fcThreeUrl = url || null
  const THREE = url ? await import(url) : null
  if (!THREE?.Frustum) throw new Error('the app\\'s three module was not found among loaded resources: ' + url)
  const sc = window.__scene
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true }
  const srcOf = (m) => String(m?.onBeforeCompile || '') + (m?.fragmentShader || '')
  const isWater = (m) => /uDisturb|uPhase|uHorizonC/.test(srcOf(m))
  const topOf = (o) => { let t = o; while (t.parent && t.parent !== sc) t = t.parent; return t.name || t.type }
  const classOf = (o) => { const top = topOf(o), m = [].concat(o.material)[0]
    if (isWater(m)) return 'water'
    if (top === 'town:trees') return 'trees'
    if (top === 'town:ground') return 'ground'
    if (top === 'town:lamps') return 'lamps'
    if (top === 'town:buildings') return 'buildings'
    if (top === 'town:setPieces' || /neon|light-show/i.test(o.name || '') || (m?.uniforms && 'uTube' in m.uniforms)) return 'displays'
    if (top === 'town:sky' || top === 'town:clouds') return 'sky'
    return 'other:' + top }
  const meshes = () => { const xs = []; sc.traverse((o) => { if ((o.isMesh || o.isPoints) && shown(o)) xs.push(o) }); return xs }
  const trisOf = (o) => { const g = o.geometry; const n = g.index ? g.index.count : (g.attributes.position?.count || 0); return Math.min(n, g.drawRange?.count ?? Infinity) / 3 }
  const census = (SAMPLE) => {
    const cam = window.__camera; cam.updateMatrixWorld(); cam.updateProjectionMatrix()
    const F = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
    const H = window.__renderer.domElement.height, fovK = H / (2 * Math.tan((cam.fov || 50) * Math.PI / 360))
    const occluders = meshes().filter((o) => { const c = classOf(o); return (c === 'buildings' || c === 'ground') && !o.isInstancedMesh && ![].concat(o.material)[0]?.transparent || (c === 'buildings') })
    const ray = new THREE.Raycaster(); ray.firstHitOnly = true
    const out = {}, m4 = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Sphere(), sc3 = new THREE.Vector3(), q = new THREE.Quaternion()
    const pts = {}
    for (const o of meshes()) {
      const c = classOf(o), g = o.geometry
      const e = out[c] ||= { meshes: 0, instances: 0, tris: 0, inFrustum: 0, sampled: 0, unoccluded: 0, subPixel: 0, merged: false }
      e.meshes++
      const t = trisOf(o)
      if (!g.boundingSphere) g.computeBoundingSphere()
      if (o.isInstancedMesh) {
        e.instances += o.count; e.tris += t * o.count
        const gr = g.attributes.aGroundRaw, r0 = g.boundingSphere.radius
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); m4.decompose(p, q, sc3)
          if (gr) p.y += gr.array[i] ?? 0
          const r = r0 * Math.max(sc3.x, sc3.y, sc3.z)
          s.center.copy(g.boundingSphere.center).multiply(sc3).add(p); s.radius = r
          if (F.intersectsSphere(s)) { e.inFrustum++; (pts[c] ||= []).push([s.center.x, s.center.y, s.center.z, r]) }
        }
      } else {
        e.instances += 1; e.tris += t; e.merged = true
        const pos = g.attributes.position; const n = pos.count, step = Math.max(1, Math.floor(n / 4000)); let inside = 0, k = 0
        for (let i = 0; i < n; i += step) { p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); k++; if (F.containsPoint(p)) { inside++; if (Math.random() < 0.05) (pts[c] ||= []).push([p.x, p.y, p.z, 0]) } }
        e.inFrustum += t * (inside / Math.max(1, k))   // merged: triangles weighted by the in-frustum share of a vertex sample
      }
    }
    for (const [c, list] of Object.entries(pts)) {
      const e = out[c]; const take = list.sort(() => Math.random() - 0.5).slice(0, SAMPLE)
      for (const [x, y, z, r] of take) {
        e.sampled++
        // ⛔ A point ON the ground (a merged mesh's vertex, a lamp's foot) is hit by the ground itself just short of it on a low
        // ray: lift the target 2 m (or half the instance's radius, if larger) and stop the ray 5 % / 5 m short of it.
        const target = new THREE.Vector3(x, y + Math.max(2, r ? r * 0.5 : 0), z), d = target.clone().sub(cam.position), dist = d.length()
        if (r && r * fovK / dist < 0.5) { e.subPixel++; continue }
        ray.set(cam.position, d.normalize()); ray.near = 0; ray.far = Math.max(0, Math.min(dist * 0.95, dist - 5))
        const hit = ray.intersectObjects(occluders, false)[0]
        if (!hit) e.unoccluded++
      }
    }
    return { out, occluders: occluders.length, cam: { pos: cam.position.toArray().map((v) => +v.toFixed(0)), near: cam.near, far: cam.far, fov: cam.fov }, buf: [window.__renderer.domElement.width, window.__renderer.domElement.height] }
  }
  const byClass = (c) => meshes().filter((o) => classOf(o) === c)
  const fcUrl = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/preview/frameCost.js'))
  const fc = await import(fcUrl)
  const gpu = async (ms) => { const r = await fc.gpuWindow(ms); if (!r.n) throw new Error('gpuWindow saw no frames'); return r }
  window.__fc = { census, byClass, gpu }
  return true
})()`)

// CLOSE: put the camera 250 m from the focus object of the first hero key (the A/B close camera), if the town has one.
if (CLOSE) {
  const r = await js(`(() => { let f; window.__scene.traverse((o) => { if (!f && /^focus:/.test(o.name || '')) f = o }); if (!f) return 'no focus object'
    const p = f.getWorldPosition(window.__camera.position.clone()), top = f.userData?.extent?.topM || 30, c = window.__camera, ctl = window.__controls
    const dir = c.position.clone().sub(p).setY(0).normalize(); c.position.copy(p).addScaledVector(dir, 250).setY(p.y + top * 0.6)
    if (ctl?.target) { ctl.target.set(p.x, p.y + top * 0.6, p.z); ctl.update?.() } else c.lookAt(p.x, p.y + top * 0.6, p.z)
    return 'close to ' + f.name })()`)
  say('  close camera: ' + r); await sleep(4000)
}

const tier = await js(`(() => { const gl = window.__renderer; return { stored: localStorage.getItem('preview.mode.v1'), target: window.__previewFrame?.().target, dpr: gl.getPixelRatio(), buf: gl.domElement.width + 'x' + gl.domElement.height, logDepth: gl.capabilities.logarithmicDepthBuffer } })()`)
say(`  tier: ${JSON.stringify(tier)}`)
if (tier.target !== MODE) say(`  ⛔ tier mismatch: asked ${MODE}, the page runs ${tier.target}`)

const C = await js(`window.__fc.census(${SAMPLE})`)
say(`  camera ${JSON.stringify(C.cam)} · buffer ${C.buf.join('x')} · occluder meshes ${C.occluders}`)
const f0 = await js(`window.__previewFrame()`)
say(`  frame (all passes): ${f0.calls} draws · ${M(f0.tris)} tris · gpu ${f0.gpuMs?.toFixed(1)} ms`)
const W = 2500, SET = 1500
const rest = () => js(`window.__fc.gpu(${W})`)
const rows = []
for (const [c, e] of Object.entries(C.out).sort((a, b) => b[1].tris - a[1].tris)) {
  if (/^other:/.test(c) && e.tris < 1000) continue
  const r1 = await rest()
  await js(`window.__fcHidden = window.__fc.byClass(${JSON.stringify(c)}); __fcHidden.forEach((o) => { o.visible = false }); true`); await sleep(SET)
  const off = await rest()
  await js(`__fcHidden.forEach((o) => { o.visible = true }); true`); await sleep(SET)
  const r2 = await rest()
  const d = (r1.ms + r2.ms) / 2 - off.ms, noise = Math.abs(r1.ms - r2.ms) / 2
  const fr = e.merged ? e.inFrustum / Math.max(1, e.tris) : e.inFrustum / Math.max(1, e.instances)
  const vis = e.sampled ? e.unoccluded / e.sampled : null
  const row = { cls: c, meshes: e.meshes, instances: e.instances, tris: e.tris, inFrustumShare: +fr.toFixed(3), sampled: e.sampled, unoccludedShare: vis == null ? null : +vis.toFixed(3), subPixel: e.subPixel, visibleEst: vis == null ? null : +(fr * vis).toFixed(3), dGpuMs: +d.toFixed(2), noise: +noise.toFixed(2), restMs: +((r1.ms + r2.ms) / 2).toFixed(2) }
  rows.push(row)
  say(`  ${c.padEnd(12)} ${String(e.meshes).padStart(5)}m ${String(e.instances).padStart(7)} inst ${M(e.tris).padStart(7)} tris · in frustum ${(fr * 100).toFixed(0)}% · unoccluded ${vis == null ? '—' : (vis * 100).toFixed(0) + '%'} of ${e.sampled} (sub-px ${e.subPixel}) · visible≈${row.visibleEst == null ? '—' : (row.visibleEst * 100).toFixed(0) + '%'} · Δgpu ${d.toFixed(1)} ms ±${noise.toFixed(1)} of ${row.restMs}`)
}
// PIXELS: does the frame's cost track the WINDOW? Full window vs half each side (¼ the pixels), by resizing the viewport the
// way a user shrinks their browser (CDP device metrics → R3F resizes the canvas AND the composer's targets). ⛔ Not
// setPixelRatio: on 2026-11-01 that moved nothing while a smaller window cut frames 2–5× (Usher), so it does not resize
// every target the frame pays for.
const px = []
for (const k of [1, 0.5]) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: Math.round(1600 * k), height: Math.round(1000 * k), deviceScaleFactor: 0, mobile: false }, S)
  await sleep(SET * 2); const g = await rest(); const buf = await js(`window.__renderer.domElement.width + 'x' + window.__renderer.domElement.height`)
  px.push({ k, buf, ms: g.ms }); say(`  window ×${k} (canvas ${buf}): gpu ${g.ms.toFixed(1)} ms`)
}
await cdp('Emulation.clearDeviceMetricsOverride', {}, S)
// TARGETS: does setPixelRatio (the quality profile's DPR cap) resize the render targets the frame draws into? One frame's
// set of target sizes at the profile's ratio, then at half of it (Boz: if not, phones pay full-size post-processing).
const targetsNow = () => js(`new Promise((res) => { const g = window.__renderer, o = g.setRenderTarget, seen = new Map()
  g.setRenderTarget = function (t, ...a) { if (t) { const k = (t.width || t.image?.width) + 'x' + (t.height || t.image?.height); seen.set(k, (seen.get(k) || 0) + 1) } return o.call(this, t, ...a) }
  requestAnimationFrame(() => requestAnimationFrame(() => { g.setRenderTarget = o; res({ canvas: g.domElement.width + 'x' + g.domElement.height, targets: [...seen].sort((x, y) => parseInt(y[0]) - parseInt(x[0])).slice(0, 12) }) })) })`)
await sleep(SET * 2)
const pr0 = tier.dpr, tA = await targetsNow()
await js(`window.__renderer.setPixelRatio(${pr0} * 0.5); true`); await sleep(SET * 2); const tB = await targetsNow()
await js(`window.__renderer.setPixelRatio(${pr0}); true`)
say(`  targets @ ratio ${pr0}: canvas ${tA.canvas} · ${tA.targets.map(([k, n]) => k + '×' + n).join(' ')}`)
say(`  targets @ ratio ${pr0 * 0.5}: canvas ${tB.canvas} · ${tB.targets.map(([k, n]) => k + '×' + n).join(' ')}`)
const targets = { atRatio: pr0, full: tA, half: tB }
for (const x of [...new Set(pageErrors)].slice(0, 6)) say('  page ' + x)

const out = join(dirname(fileURLToPath(import.meta.url)), 'runs'); mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${TOWN}-${SHOT}${CLOSE ? '-close' : ''}-${MODE}.json`), JSON.stringify({ town: TOWN, shot: SHOT, close: CLOSE, mode: MODE, tier, cam: C.cam, frame0: f0, rows, px, targets, load: loadavg(), log }, null, 1))
ws.close(); cleanup(); process.exit(0)
