// Tree cull A/B (Sigil, 2026-11-02; Boz's gate for enabling the dormant cull, Zob's rules). In page memory only: flips
// treeCull.on (src/lib/treeCells.js, the app's own module instance) at runtime.
//
//   node scratch/tree-ab/probe.mjs --town=<look> [--flight]
//
// STILL: Stage headless, cameras from the disc (far/mid/close) + a LOW SUN (dusk) at the close camera. Per camera: the noise
// floor (two frames, cull off), then cull ON: Δ GPU ms (frameCost, Preview's timer) and the pixel diff against the off frame.
// Zob's rule: the threshold IS the noise floor; ON passes when its diff does not exceed the floor.
// FLIGHT (--flight): Preview headless, Hero ↔ Browse flights, cull off then on, at 1× and 4× CPU: main-thread ms per frame
// (frameCost.mainMs), long animation frames, and the cull's buffer REWRITES per second (a hero draw's count changing).
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir, loadavg } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = arg('town', 'provincetown'), BASE = arg('base', 'http://localhost:5173'), FLIGHT = process.argv.includes('--flight')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'tree-ab-'))
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
// ⛔ The resource-timing buffer holds 250 entries by default and this app loads more: a module loaded later is not listed.
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(20000)' }, S)
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value }
const log = []; const say = (s) => { console.log(s); log.push(s) }
if (FLIGHT) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.mode.v1', 'desktop'); localStorage.setItem('cartograph-last-stage-shot', 'hero')` }, S)
await cdp('Page.navigate', { url: FLIGHT ? `${BASE}/preview.html?look=${TOWN}` : `${BASE}/stage/${TOWN}/hero` }, S)
say(`== tree cull A/B · ${TOWN} · ${FLIGHT ? 'Preview flights' : 'Stage still'} · M1 headless · load ${loadavg().map((x) => x.toFixed(1)).join(' ')} ==`)
for (let i = 0; i < 150; i++) { await sleep(1000); if (await js(`!!(window.__scene && window.__camera && window.__scene.children.some(o => o.name === 'town:trees'))`).catch(() => false)) break }
await sleep(12000)

await js(`(async () => {
  const g = window.__renderer, gl = g.getContext(), urls = performance.getEntriesByType('resource').map((e) => e.name)
  // The app's OWN module instances (Vite may stamp them ?t=…; a bare import would be a second, empty instance).
  const cellsUrl = urls.find((n) => n.includes('/src/lib/treeCells.js')), fcUrl = urls.find((n) => n.includes('/src/preview/frameCost.js'))
  if (!cellsUrl) throw new Error('treeCells.js is not loaded on this page: is the cull merged?')
  const cells = await import(cellsUrl), fc = await import(fcUrl || '/src/preview/frameCost.js')
  if (!fcUrl) fc.installFrameCost(g)
  const gpu = async (ms) => { const r = await fc.gpuWindow(ms); if (!r.n) throw new Error('gpuWindow saw no frames'); return +r.ms.toFixed(2) }
  const W = 400, H = 216
  const grab = () => new Promise((res) => { const o = g.render; g.render = function (...a) { const r = o.apply(this, a); if (g.getRenderTarget() === null) { g.render = o
      const cw = g.domElement.width, ch = g.domElement.height, px = new Uint8Array(cw * ch * 4); gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, px)
      const out = new Float32Array(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = Math.floor(x * cw / W), sy = Math.floor(y * ch / H), i = (sy * cw + sx) * 4, j = (y * W + x) * 3; out[j] = px[i]; out[j + 1] = px[i + 1]; out[j + 2] = px[i + 2] }
      res(out) } return r } })
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 3) { if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 12) n++ } return +(100 * n / (a.length / 3)).toFixed(2) }
  const hero = []; window.__scene.getObjectByName('town:trees').traverse((o) => { if (o.isInstancedMesh && o.geometry?.attributes?.aGround && o.geometry?.attributes?.aOverhead) hero.push(o) })
  // rewrites: a hero draw's count changing between frames (the cull rewrote its buffers)
  let rew = 0, last = hero.map((m) => m.count), counting = false
  const tick = () => { if (counting) { hero.forEach((m, i) => { if (m.count !== last[i]) { rew++; last[i] = m.count } }) } requestAnimationFrame(tick) }; requestAnimationFrame(tick)
  const rewrites = async (ms) => { rew = 0; last = hero.map((m) => m.count); counting = true; await new Promise((r) => setTimeout(r, ms)); counting = false; return rew }
  const drawn = () => hero.reduce((a, m) => a + m.count, 0), total = hero.reduce((a, m) => a + m.instanceMatrix.count, 0)
  // FREEZE THE INSTANT (Zob's (c)): hold performance.now and Date.now, so the frame loop renders with Δt = 0 — the wind sheet,
  // water, clouds and the time ticker do not advance — and the same instant can be drawn twice, cull off then on.
  const _pn = performance.now.bind(performance), _dn = Date.now
  const freeze = () => { const T = _pn(), D = _dn(); performance.now = () => T; Date.now = () => D }
  const unfreeze = () => { performance.now = _pn; Date.now = _dn }
  // LOCATION: the share of changed pixels in a border band (one cell of the 400×216 grab per 4 % of the frame) against the rest
  const where = (a, b) => { let bn = 0, bt = 0, inn = 0, it = 0; const bw = Math.round(W * 0.04), bh = Math.round(H * 0.04)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = (y * W + x) * 3, d = Math.max(Math.abs(a[j] - b[j]), Math.abs(a[j + 1] - b[j + 1]), Math.abs(a[j + 2] - b[j + 2])) > 12
      if (x < bw || x >= W - bw || y < bh || y >= H - bh) { bt++; if (d) bn++ } else { it++; if (d) inn++ } }
    return { borderPct: +(100 * bn / bt).toFixed(2), innerPct: +(100 * inn / it).toFixed(2) } }
  window.__ab = { cells, fc, gpu, grab, diff, rewrites, drawn, total, heroN: hero.length, freeze, unfreeze, where }
  cells.treeCull.on = false
  return true
})()`)
const results = { town: TOWN, mode: FLIGHT ? 'flight' : 'still', rows: [] }
if (!FLIGHT) {
  const disc = await js(`fetch('/baked/${TOWN}/ground.json').then(r => r.json()).then(g => ({ c: g.stencil.center, r: g.stencil.radius }))`)
  const [cx, cz] = Array.isArray(disc.c) ? disc.c : [disc.c.x, disc.c.z ?? disc.c.y], R = disc.r
  const cams = { far: { pos: [cx, 0.08 * R, cz + 0.85 * R], tgt: [cx, 0, cz] }, mid: { pos: [cx, 0.04 * R, cz + 0.35 * R], tgt: [cx, 5, cz] },
    close: { pos: [cx, 30, cz + 0.12 * R], tgt: [cx, 10, cz] }, closeLowSun: { pos: [cx, 30, cz + 0.12 * R], tgt: [cx - 0.12 * R, 10, cz], dusk: true } }
  for (const [cn, cam] of Object.entries(cams)) {
    if (cam.dusk) { const b = await js(`(() => { const x = [...document.querySelectorAll('button,span,div')].find(e => e.textContent.trim() === 'Dusk' && e.offsetParent); if (x) { x.click(); return true } return false })()`); say(`  (dusk ${b ? 'set' : 'NOT FOUND — the low-sun row is at the current time'})`); await sleep(3000) }
    await js(`(() => { const c = window.__camera, t = window.__controls; c.position.set(${cam.pos.join(',')}); t.target.set(${cam.tgt.join(',')}); t.update(); __ab.cells.treeCull.on = false; return true })()`); await sleep(4000)
    const r = await js(`(async () => {
      // GPU ms on the live clock (time must run for a fair timer), off then on
      __ab.cells.treeCull.on = false; await new Promise(r => setTimeout(r, 1500)); const off = await __ab.gpu(3000), dOff = __ab.drawn()
      __ab.cells.treeCull.on = true; await new Promise(r => setTimeout(r, 2500)); const on = await __ab.gpu(3000), dOn = __ab.drawn()
      // the SAME instant twice with the cull off (the floor), then with it on
      __ab.cells.treeCull.on = false; await new Promise(r => setTimeout(r, 1500))
      __ab.freeze(); await new Promise(r => setTimeout(r, 600))
      const a = await __ab.grab(), a2 = await __ab.grab(), noise = __ab.diff(a, a2)
      __ab.cells.treeCull.on = true; await new Promise(r => setTimeout(r, 900))
      const b = await __ab.grab(); const loc = __ab.where(a, b), d = __ab.diff(a, b)
      __ab.cells.treeCull.on = false; __ab.unfreeze(); await new Promise(r => setTimeout(r, 1200))
      return { noise, off, on, diff: d, ...loc, drawnOff: dOff, drawnOn: dOn, total: __ab.total }
    })()`)
    const pass = r.diff <= Math.max(r.noise, 0.05) && r.borderPct <= Math.max(r.noise, 0.05)
    say(`  ${cn.padEnd(11)} off ${r.off} → on ${r.on} ms GPU (Δ ${(r.on - r.off).toFixed(1)}) · drawn ${r.drawnOff} → ${r.drawnOn} of ${r.total} · frozen diff ${r.diff}% (border ${r.borderPct}% / inner ${r.innerPct}%) vs same-instant noise ${r.noise}% → ${pass ? 'NO-OP' : '⛔ DIFFERS'} · uptime ${loadavg()[0].toFixed(1)}`)
    results.rows.push({ cam: cn, ...r, pass })
  }
} else {
  const press = (label) => js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '${label}'); if (!b) return false; b.click(); return true })()`)
  for (const rate of [1, 4]) for (const on of [false, true]) {
    await cdp('Emulation.setCPUThrottlingRate', { rate }, S); await js(`(() => { __ab.cells.treeCull.on = ${on}; return true })()`); await sleep(2000)
    const samples = []
    for (let k = 0; k < 2; k++) {
      await press('Browse'); const rw1 = js(`__ab.rewrites(6000)`); const m1 = []; for (let t = 0; t < 6; t++) { await sleep(1000); m1.push(await js(`({ main: __ab.fc.frameCost.mainMs, loafN: __ab.fc.frameCost.loaf.n, loafWorst: __ab.fc.frameCost.loaf.worstMs })`)) }
      await press('Hero'); const rw2 = js(`__ab.rewrites(6000)`); const m2 = []; for (let t = 0; t < 6; t++) { await sleep(1000); m2.push(await js(`({ main: __ab.fc.frameCost.mainMs, loafN: __ab.fc.frameCost.loaf.n, loafWorst: __ab.fc.frameCost.loaf.worstMs })`)) }
      samples.push({ rewrites: (await rw1) + (await rw2), m: [...m1, ...m2] })
    }
    const all = samples.flatMap((s) => s.m), mainMean = all.reduce((a, x) => a + x.main, 0) / all.length, worst = Math.max(...all.map((x) => x.loafWorst || 0))
    const rps = samples.reduce((a, s) => a + s.rewrites, 0) / (samples.length * 12)
    say(`  CPU ${rate}× · cull ${on ? 'ON ' : 'off'} · rewrites ${rps.toFixed(1)}/s · main ${mainMean.toFixed(2)} ms/frame (30-frame mean) · worst long frame ${worst.toFixed(0)} ms · uptime ${loadavg()[0].toFixed(1)}`)
    results.rows.push({ rate, on, mainMean, worst, rewritesPerS: rps })
  }
  await cdp('Emulation.setCPUThrottlingRate', { rate: 1 }, S)
}
const out = join(dirname(fileURLToPath(import.meta.url)), 'runs'); mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${TOWN}-${FLIGHT ? 'flight' : 'still'}.json`), JSON.stringify({ ...results, load: loadavg(), log }, null, 1))
ws.close(); cleanup(); process.exit(0)
