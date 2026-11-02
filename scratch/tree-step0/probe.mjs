// Trees step 0 (Sigil, 2026-11-02; phase two (b), Boz's go, Zob's points). MEASUREMENT ONLY, in page memory: Stage
// headless at fixed cameras derived from the town's disc, Preview's GPU timer (frameCost.js) installed into Stage.
//
//   node scratch/tree-step0/probe.mjs --town=<look>
//
// The hero impostor's layers are told apart by what the code builds (HeroImpostorTrees.jsx), not by names (it names none):
// the FRONT leaf shell is the tessellated card (FRONT_GRID > 1 → more than 4 vertices); the back leaf shell and the bark are
// flat 4-vertex cards, the bark at brightness 0.8, a back leaf shell below 1.0 and not 0.8.
// Per camera: V0 · front shells hidden · back shells hidden · bark hidden · every hero impostor hidden · all trees hidden ·
// the instance share in frustum (per instance, bounding sphere from the card's own size). Then: trees on/off at half the
// window (fill vs vertex), and the CPU cost of a per-instance frustum pass over every hero-impostor instance, per frame,
// at 1× and at 4× CPU throttle (what compaction on every frame of a flight would cost).
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir, loadavg } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = arg('town', 'provincetown'), BASE = arg('base', 'http://localhost:5173')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'tree-step0-'))
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
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value }
await cdp('Page.navigate', { url: `${BASE}/stage/${TOWN}/hero` }, S)
const log = []; const say = (s) => { console.log(s); log.push(s) }
say(`== trees step 0 · ${TOWN} · Stage headless, this M1 · load ${loadavg().map((x) => x.toFixed(1)).join(' ')} ==`)
for (let i = 0; i < 150; i++) { await sleep(1000); if (await js(`!!(window.__scene && window.__camera && window.__controls && window.__scene.children.some(o => o.name === 'town:trees'))`).catch(() => false)) break }
await sleep(10000)

await js(`(async () => {
  const sc = window.__scene, g = window.__renderer, gl = g.getContext(), T = window.__camera.constructor
  const trees = sc.children.find((o) => o.name === 'town:trees')
  const fcMod = await import('/src/preview/frameCost.js'); fcMod.installFrameCost(g)
  const gpu = async (ms) => { const r = await fcMod.gpuWindow(ms); if (!r.n) throw new Error('gpuWindow saw no frames'); return +r.ms.toFixed(2) }
  const hero = []; trees.traverse((o) => { if (o.isInstancedMesh && o.geometry?.attributes?.aOverhead && (() => { const gg = o.geometry; if (!gg.boundingBox) gg.computeBoundingBox(); return gg.boundingBox.max.y - gg.boundingBox.min.y > 1e-3 })()) hero.push(o) })
  const layerOf = (m) => { const v = m.geometry.attributes.position.count, b = m.material.color?.r ?? 1; return v > 4 ? 'front' : Math.abs(b - 0.8) < 0.01 ? 'bark' : 'back' }
  const byLayer = { front: hero.filter((m) => layerOf(m) === 'front'), back: hero.filter((m) => layerOf(m) === 'back'), bark: hero.filter((m) => layerOf(m) === 'bark') }
  const W = 400, H = 216
  const grab = () => new Promise((res) => { const o = g.render; g.render = function (...a) { const r = o.apply(this, a); if (g.getRenderTarget() === null) { g.render = o
      const cw = g.domElement.width, ch = g.domElement.height, px = new Uint8Array(cw * ch * 4); gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, px)
      const out = new Float32Array(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = Math.floor(x * cw / W), sy = Math.floor(y * ch / H), i = (sy * cw + sx) * 4, j = (y * W + x) * 3; out[j] = px[i]; out[j + 1] = px[i + 1]; out[j + 2] = px[i + 2] }
      res(out) } return r } })
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 3) { if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 12) n++ } return +(100 * n / (a.length / 3)).toFixed(2) }
  // Per-instance frustum share and the CPU cost of the pass that would compact them (bounding sphere: the card's own bbox x scale).
  const m4 = new window.__camera.matrixWorld.constructor(), p = window.__camera.position.clone()
  const frustumPass = () => { const cam = window.__camera; cam.updateMatrixWorld()
    const pm = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse), e = pm.elements
    // six planes from the projection matrix (Gribb–Hartmann), inline so the pass costs what a compaction pass would
    const P = [[e[3]+e[0],e[7]+e[4],e[11]+e[8],e[15]+e[12]],[e[3]-e[0],e[7]-e[4],e[11]-e[8],e[15]-e[12]],[e[3]+e[1],e[7]+e[5],e[11]+e[9],e[15]+e[13]],[e[3]-e[1],e[7]-e[5],e[11]-e[9],e[15]-e[13]],[e[3]+e[2],e[7]+e[6],e[11]+e[10],e[15]+e[14]],[e[3]-e[2],e[7]-e[6],e[11]-e[10],e[15]-e[14]]].map(([a,b,c,d]) => { const l = Math.hypot(a,b,c); return [a/l,b/l,c/l,d/l] })
    let n = 0, inside = 0
    for (const m of hero) { const arr = m.instanceMatrix.array, bb = m.geometry.boundingBox, r0 = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) / 2, gr = m.geometry.attributes.aGroundRaw
      for (let i = 0; i < m.count; i++) { const o = i * 16, s = Math.hypot(arr[o], arr[o+1], arr[o+2]), x = arr[o+12], y = arr[o+13] + (gr ? gr.array[i] : 0) + r0 * s, z = arr[o+14], r = r0 * s
        n++; let ok = true; for (const pl of P) { if (pl[0]*x + pl[1]*y + pl[2]*z + pl[3] < -r) { ok = false; break } } if (ok) inside++ } }
    return { n, inside } }
  const cpuPerPass = (reps) => { const t0 = performance.now(); let r; for (let k = 0; k < reps; k++) r = frustumPass(); return { ms: +((performance.now() - t0) / reps).toFixed(3), ...r } }
  window.__t0 = { sc, trees, hero, byLayer, gpu, grab, diff, frustumPass, cpuPerPass,
    counts: { heroDraws: hero.length, front: byLayer.front.length, back: byLayer.back.length, bark: byLayer.bark.length, instances: hero.reduce((a, m) => a + m.count, 0) } }
  return true
})()`)
const counts = await js(`__t0.counts`)
say(`  hero impostor draws ${counts.heroDraws} (front ${counts.front} · back ${counts.back} · bark ${counts.bark}) · ${counts.instances} instance draws in all`)
const disc = await js(`fetch('/baked/${TOWN}/ground.json').then(r => r.json()).then(g => ({ c: g.stencil.center, r: g.stencil.radius }))`)
const [cx, cz] = Array.isArray(disc.c) ? disc.c : [disc.c.x, disc.c.z ?? disc.c.y], R = disc.r
const cams = { far: { pos: [cx, 0.08 * R, cz + 0.85 * R], tgt: [cx, 0, cz] }, mid: { pos: [cx, 0.04 * R, cz + 0.35 * R], tgt: [cx, 5, cz] }, close: { pos: [cx, 30, cz + 0.12 * R], tgt: [cx, 10, cz] } }
const V = {
  front: `__t0.byLayer.front.forEach(m => m.visible = false)`, back: `__t0.byLayer.back.forEach(m => m.visible = false)`, bark: `__t0.byLayer.bark.forEach(m => m.visible = false)`,
  heroAll: `__t0.hero.forEach(m => m.visible = false)`, trees: `__t0.trees.visible = false`,
}
const restore = `(() => { __t0.hero.forEach(m => m.visible = true); __t0.trees.visible = true; return true })()`
const results = { town: TOWN, counts, rows: [] }
for (const [cn, cam] of Object.entries(cams)) {
  await js(`(() => { const c = window.__camera, t = window.__controls; c.position.set(${cam.pos.join(',')}); t.target.set(${cam.tgt.join(',')}); t.update(); return true })()`); await sleep(3500)
  await js(`(async () => { window.__t0.base = await __t0.grab(); return true })()`)
  const noise = await js(`(async () => __t0.diff(__t0.base, await __t0.grab()))()`)
  const v0 = await js(`__t0.gpu(3000)`), fr = await js(`__t0.frustumPass()`)
  say(`  ${cn.padEnd(5)} cam ${JSON.stringify(cam.pos.map(Math.round))} · V0 ${v0} ms GPU · uptime ${loadavg()[0].toFixed(1)} · noise ${noise}% · hero instances in frustum ${fr.inside}/${fr.n} (${(100 * fr.inside / Math.max(1, fr.n)).toFixed(0)}%)`)
  const row = { cam: cn, v0, noise, frustum: fr, v: {} }
  for (const [vn, code] of Object.entries(V)) {
    await js(`(() => { ${code}; return true })()`); await sleep(2000)
    const r = await js(`(async () => ({ ms: await __t0.gpu(3000), d: __t0.diff(__t0.base, await __t0.grab()) }))()`)
    await js(restore); await sleep(1200)
    row.v[vn] = r; say(`        ${vn.padEnd(7)} Δ ${(r.ms - v0).toFixed(1).padStart(6)} ms · covers ${r.d}%`)
  }
  results.rows.push(row)
}
// fill vs vertex at the last camera: trees on/off at half the window
await cdp('Emulation.setDeviceMetricsOverride', { width: 800, height: 500, deviceScaleFactor: 0, mobile: false }, S); await sleep(4000)
const h0 = await js(`__t0.gpu(3000)`); await js(`(() => { __t0.trees.visible = false; return true })()`); await sleep(2000)
const h1 = await js(`__t0.gpu(3000)`); await js(restore); await cdp('Emulation.clearDeviceMetricsOverride', {}, S); await sleep(2000)
say(`  half window (close cam): V0 ${h0} ms · trees hidden ${h1} ms (Δ ${(h1 - h0).toFixed(1)}) — compare with the full-window Δ above`)
results.half = { v0: h0, treesOff: h1 }
// the CPU cost of a per-instance frustum pass, per frame, at 1× and 4× CPU throttle
const c1 = await js(`__t0.cpuPerPass(20)`)
await cdp('Emulation.setCPUThrottlingRate', { rate: 4 }, S); const c4 = await js(`__t0.cpuPerPass(10)`); await cdp('Emulation.setCPUThrottlingRate', { rate: 1 }, S)
say(`  per-instance frustum pass over ${c1.n} hero-impostor instances: ${c1.ms} ms per frame at 1× CPU, ${c4.ms} ms at 4× (a compaction would add the buffer writes on top)`)
results.cpu = { x1: c1, x4: c4 }
const out = join(dirname(fileURLToPath(import.meta.url)), 'runs'); mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${TOWN}.json`), JSON.stringify({ ...results, load: loadavg(), log }, null, 1))
ws.close(); cleanup(); process.exit(0)
