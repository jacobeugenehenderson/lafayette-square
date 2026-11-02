// Ground step 0 (Sigil, 2026-11-02; phase two (a), Boz's go, Zob's four points). MEASUREMENT ONLY, in page memory: drives the
// running :5173 Stage headless at fixed cameras and compares variants of the GROUND'S PASS against the baseline, by frame
// interval and draw calls, and by a pixel diff against the baseline's own frame-to-frame noise.
//
//   node scratch/ground-step0/probe.mjs --town=<look>
//
// Cameras (from the town's own first hero key, so nothing is a constant): FAR = the key's own pose; HIGH = 600 m over its aim,
// looking down; CLOSE = 20 % of the way from the aim back to the key. Variants (each restored before the next):
//   V0  baseline (twice: the second capture is the noise floor)
//   V1  every ground group OPAQUE (transparent off): its rim band loses its fade — expected diff at the rim only
//   V1r V1, the ground's renderOrders reversed (ribbons first) so early-z rejects the faces under them
//   V2  the RIBBON groups hidden (kind !== 'face'): their share of the cost
//   V3  the whole ground hidden, at the full window and at half the window: fill versus geometry
// ⛔ The frame interval is rAF-to-rAF in a headless tab: it tracks GPU time only while the GPU is the bottleneck (it is,
// 100+ ms here); a variant faster than the display cap reads as the cap.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir, loadavg } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = arg('town', 'provincetown'), BASE = arg('base', 'http://localhost:5173')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'ground-step0-'))
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
const errs = []
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200)) }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value }
await cdp('Page.navigate', { url: `${BASE}/stage/${TOWN}/hero` }, S)
const log = []; const say = (s) => { console.log(s); log.push(s) }
say(`== ground step 0 · ${TOWN} · Stage headless, this M1 · load ${loadavg().map((x) => x.toFixed(1)).join(' ')} ==`)
for (let i = 0; i < 150; i++) { await sleep(1000); if (await js(`!!(window.__scene && window.__camera && window.__controls && window.__scene.children.some(o => o.name === 'town:ground' && o.children.length))`).catch(() => false)) break }
await sleep(8000)

await js(`(async () => {
  const sc = window.__scene, g = window.__renderer, gl = g.getContext()
  const ground = sc.children.find((o) => o.name === 'town:ground')
  const meshes = []; ground.traverse((o) => { if (o.isMesh) meshes.push(o) })
  const W = 400, H = 216
  // One frame's pixels, read in the SAME call as the final draw to the screen (before the browser presents it), downsampled.
  const grab = () => new Promise((res) => { const o = g.render; g.render = function (...a) { const r = o.apply(this, a); if (g.getRenderTarget() === null) { g.render = o
      const cw = g.domElement.width, ch = g.domElement.height, px = new Uint8Array(cw * ch * 4); gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, px)
      const out = new Float32Array(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = Math.floor(x * cw / W), sy = Math.floor(y * ch / H), i = (sy * cw + sx) * 4, j = (y * W + x) * 3; out[j] = px[i]; out[j + 1] = px[i + 1]; out[j + 2] = px[i + 2] }
      res(out) } return r } })
  const diff = (a, b) => { let n = 0, sum = 0; for (let i = 0; i < a.length; i += 3) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); sum += d; if (d > 12) n++ } return { changedPct: +(100 * n / (a.length / 3)).toFixed(2), meanAbs: +(sum / (a.length / 3)).toFixed(2) } }
  const interval = (ms) => new Promise((res) => { const ts = []; const t0 = performance.now(); const f = (t) => { ts.push(t); if (t - t0 < ms) requestAnimationFrame(f); else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((x, y) => x - y); res(+d[Math.floor(d.length / 2)].toFixed(1)) } }; requestAnimationFrame(f) })
  const calls = () => new Promise((res) => { const i = g.info; const ar = i.autoReset; i.autoReset = false; i.reset(); requestAnimationFrame(() => requestAnimationFrame(() => { const c = i.render.calls, t = i.render.triangles; i.autoReset = ar; res({ c, t }) })) })
  const state = meshes.map((m) => ({ m, vis: m.visible, ro: m.renderOrder, tr: [].concat(m.material).map((x) => x.transparent) }))
  const restore = () => { for (const s of state) { s.m.visible = s.vis; s.m.renderOrder = s.ro; [].concat(s.m.material).forEach((x, k) => { if (x.transparent !== s.tr[k]) { x.transparent = s.tr[k]; x.needsUpdate = true } }) } }
  // A mesh carries its group's renderOrder (BakedGround: renderOrder={group.renderOrder}); the kind is the slab's ground.json group's.
  const man = await fetch('/baked/${TOWN}/ground.json').then((r) => r.json())
  const kindByRo = new Map(man.groups.map((x) => [x.renderOrder, x.kind ?? '?']))
  const kindOf = (m) => kindByRo.get(Math.abs(m.renderOrder)) ?? kindByRo.get(m.renderOrder) ?? null
  // Preview's own GPU timer (frameCost.js#installFrameCost + gpuWindow), installed into Stage on the app's R3F loop.
  const fcMod = await import('/src/preview/frameCost.js'); fcMod.installFrameCost(g)
  const gpu = async (ms) => { const r = await fcMod.gpuWindow(ms); if (!r.n) throw new Error('gpuWindow saw no frames'); return +r.ms.toFixed(2) }
  const isWater = (m) => [].concat(m.material).some((x) => /uDisturb|uPhase|uHorizonC/.test(String(x.onBeforeCompile || '') + (x.fragmentShader || '')))
  window.__s0 = { sc, ground, meshes, grab, diff, interval, calls, restore, kindOf, gpu, isWater,
    faded: meshes.filter((m) => [].concat(m.material).some((x) => x.transparent)).length,
    kinds: meshes.reduce((a, m) => { const k = kindOf(m) ?? '?'; a[k] = (a[k] || 0) + 1; return a }, {}) }
  return true
})()`)
const info = await js(`({ meshes: __s0.meshes.length, transparent: __s0.faded, kinds: __s0.kinds, roRange: [Math.min(...__s0.meshes.map(m => m.renderOrder)), Math.max(...__s0.meshes.map(m => m.renderOrder))] })`)
say(`  ground: ${info.meshes} meshes, ${info.transparent} transparent (the fade), kinds ${JSON.stringify(info.kinds)}, renderOrder ${info.roRange.join('…')}`)

// Cameras from the town's own disc (ground.json's stencil: centre and radius), so every town gets the same three shots.
const disc = await js(`fetch('/baked/${TOWN}/ground.json').then(r => r.json()).then(g => ({ c: g.stencil.center, r: g.stencil.radius }))`)
const [cx, cz] = Array.isArray(disc.c) ? disc.c : [disc.c.x, disc.c.z ?? disc.c.y], R = disc.r
const cams = {
  far: { pos: [cx, 0.08 * R, cz + 0.85 * R], tgt: [cx, 0, cz] },
  high: { pos: [cx, 0.6 * R, cz + 0.05 * R], tgt: [cx, 0, cz] },
  close: { pos: [cx, 30, cz + 0.12 * R], tgt: [cx, 10, cz] },
}
say(`  disc centre ${JSON.stringify(disc.c)} radius ${R} m → cameras ${JSON.stringify(Object.fromEntries(Object.entries(cams).map(([k, v]) => [k, v.pos.map(Math.round)])))}`)
const VARIANTS = {
  // ⛔ v1 of this probe forced the WATER opaque too (it sits under town:ground): the harbour painted over, not a rim. Fixed.
  V1: `__s0.meshes.forEach(m => { if (!__s0.isWater(m)) [].concat(m.material).forEach(x => { if (x.transparent) { x.transparent = false; x.needsUpdate = true } }) })`,
  V1r: `__s0.meshes.forEach(m => { if (__s0.isWater(m)) return; m.renderOrder = -m.renderOrder; [].concat(m.material).forEach(x => { if (x.transparent) { x.transparent = false; x.needsUpdate = true } }) })`,
  V2: `__s0.meshes.forEach(m => { if (__s0.kindOf(m) && __s0.kindOf(m) !== 'face') m.visible = false })`,
  V3: `__s0.ground.visible = false`,
}
const results = { town: TOWN, info, cams, rows: [] }
for (const [cn, cam] of Object.entries(cams)) {
  await js(`(() => { const c = window.__camera, t = window.__controls; c.position.set(${cam.pos.join(',')}); t.target.set(${cam.tgt.join(',')}); t.update(); return true })()`)
  await sleep(3000)
  const b1 = await js(`(async () => { window.__s0.base = await __s0.grab(); return true })()`)
  const noise = await js(`(async () => __s0.diff(__s0.base, await __s0.grab()))()`)
  const base = await js(`(async () => ({ ms: await __s0.gpu(3000), ...(await __s0.calls()) }))()`)
  say(`  ${cn.padEnd(5)} cam ${JSON.stringify(cam.pos.map((v) => Math.round(v)))} · V0 ${base.ms} ms GPU ${base.c} calls · uptime ${loadavg()[0].toFixed(1)} ${(base.t / 1e6).toFixed(2)}M tris · noise ${noise.changedPct}% (mean ${noise.meanAbs})`)
  const row = { cam: cn, base, noise, v: {} }
  for (const [vn, code] of Object.entries(VARIANTS)) {
    await js(`(() => { ${code}; return true })()`); await sleep(2500)
    const v = await js(`(async () => ({ ms: await __s0.gpu(3000), ...(await __s0.calls()), d: __s0.diff(__s0.base, await __s0.grab()) }))()`)
    await js(`(() => { __s0.restore(); __s0.ground.visible = true; return true })()`); await sleep(1500)
    row.v[vn] = v
    say(`        ${vn.padEnd(4)} ${String(v.ms).padStart(6)} ms GPU (${(v.ms - base.ms).toFixed(1).padStart(6)}) · ${v.c} calls · diff ${v.d.changedPct}% (mean ${v.d.meanAbs})`)
  }
  results.rows.push(row)
}
// PER RIBBON GROUP, at the last camera: Δ GPU ms when that group alone is hidden, and the pixels it covers (the diff).
const groups = await js(`[...new Set(__s0.meshes.filter(m => __s0.kindOf(m) && __s0.kindOf(m) !== 'face' && !__s0.isWater(m)).map(m => m.renderOrder))]`)
const perGroup = []
for (const ro of groups) {
  const r0 = await js(`__s0.gpu(2000)`)
  await js(`(() => { __s0.meshes.forEach(m => { if (m.renderOrder === ${ro}) m.visible = false }); return true })()`); await sleep(1200)
  const r1 = await js(`(async () => ({ ms: await __s0.gpu(2000), d: __s0.diff(__s0.base, await __s0.grab()) }))()`)
  await js(`(() => { __s0.restore(); return true })()`); await sleep(800)
  perGroup.push({ ro, dMs: +(r0 - r1.ms).toFixed(2), coverPct: r1.d.changedPct })
}
perGroup.sort((a, b) => b.dMs - a.dMs)
say(`  per ribbon group (last cam), top by Δ GPU ms: ${perGroup.slice(0, 8).map(g => `ro${g.ro} ${g.dMs}ms/${g.coverPct}%`).join(' · ')}`)
say(`  sum of per-group Δ ${perGroup.reduce((a, g) => a + g.dMs, 0).toFixed(1)} ms over ${perGroup.length} groups`)
results.perGroup = perGroup
// V3 at half the window: does hiding the ground save as much when there are a quarter of the pixels? (fill vs geometry)
await cdp('Emulation.setDeviceMetricsOverride', { width: 800, height: 500, deviceScaleFactor: 0, mobile: false }, S); await sleep(4000)
const h0 = await js(`__s0.gpu(3000)`); await js(`(() => { __s0.ground.visible = false; return true })()`); await sleep(2500)
const h3 = await js(`__s0.gpu(3000)`); await js(`(() => { __s0.ground.visible = true; return true })()`)
await cdp('Emulation.clearDeviceMetricsOverride', {}, S)
say(`  half window (close cam): V0 ${h0} ms · ground hidden ${h3} ms (${(h3 - h0).toFixed(1)})`)
results.half = { cam: Object.keys(cams).at(-1), v0: h0, v3: h3 }
for (const e of [...new Set(errs)].slice(0, 4)) say('  page EXC ' + e)
const out = join(dirname(fileURLToPath(import.meta.url)), 'runs'); mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${TOWN}.json`), JSON.stringify({ ...results, load: loadavg(), log }, null, 1))
ws.close(); cleanup(); process.exit(0)
