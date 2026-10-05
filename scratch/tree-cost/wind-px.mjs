// The card-wind GATE (BRIEF-card-wind-hsb, Grain 2026-10-04): how many screen pixels the card wind moves a crown top,
// per on-screen tree, at rest-wind and at a GUST PEAK (windGustAt = 1 ⇒ felt = base + gust amplitude).
// ⭐ READS THE LIVE VALUES: the Tree Wind uniforms off each compiled card material and the wind state the sheet feeds
// (uWindBaseSpeed / uWindGustAmp), never copied gains. The one thing mirrored is the shader's own arithmetic,
// treeAtlasMaterial.js#TREE_WIND_GLSL treeWindCrown — keep the two in step. COMPUTED through the live camera at each
// tree's real top (instance × geometry bbox), not measured off frames, so GPU load cannot skew it.
//   node scratch/tree-cost/wind-px.mjs --town=lafayette-square --shot=browse|hero [--mode=desktop]
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const TOWN = arg('town', 'lafayette-square'), SHOT = arg('shot', 'browse'), MODE = arg('mode', 'desktop')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'tree-cost-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(1) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map(); const errs = []
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')) }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.mode.v1', '${MODE}'); localStorage.setItem('cartograph-last-stage-shot', '${SHOT}')` }, S)
await cdp('Page.navigate', { url: `http://localhost:5173/preview.html?look=${TOWN}` }, S)
await sleep(24000)
if (errs.some((x) => /SHADER DID NOT LINK/.test(x))) { console.log('⛔ a shader did not link — no reading'); cleanup(); process.exit(1) }
const r = await cdp('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
  const threeUrl = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\\/deps\\/three\\.js/.test(n)); const T = await import(threeUrl)
  const R = window.__renderer, cam = window.__camera, size = R.getDrawingBufferSize(new T.Vector2())
  const meshes = []; window.__scene.getObjectByName('town:trees').traverse((o) => { if (!o.isInstancedMesh || !o.count) return; for (let p = o; p; p = p.parent) if (!p.visible) return; const u = R.properties.get(o.material)?.uniforms; if (u?.uTreeWindFloorPx) meshes.push([o, u]) })
  if (!meshes.length) return { error: 'no shown card mesh carries the Tree Wind uniforms' }
  const u = meshes[0][1], v = (k) => u[k].value
  const base = v('uWindBaseSpeed'), gustAmp = v('uWindGustAmp')
  // ── mirror of TREE_WIND_GLSL treeWindCrown (lean m, flutter m at the crown) ──
  // ── mirror of TREE_WIND_GLSL treeWindCrown: endemic rustle + real weather, the weather's part floored at gusts ──
  const crown = (felt, gust, floorM) => { const st = [v('uTreeWindLeanRefM'), v('uTreeWindFlutRefM')]
    let wi = [v('uTreeWindLeanPerMps') * felt, v('uTreeWindFlutPerMps') * felt]
    const lift = gust * floorM, have = wi[0] + wi[1]
    wi = have > 1e-6 ? wi.map((x) => x * Math.max(1, lift / have)) : [0.5 * lift, 0.5 * lift]
    return { steady: st, wind: wi } }
  const proj = (p) => { const q = p.clone().project(cam); return { x: (q.x * 0.5 + 0.5) * size.x, y: (q.y * 0.5 + 0.5) * size.y, z: q.z } }
  const dir = new T.Vector3(1, 0, 0), M = new T.Matrix4(), Wm = new T.Matrix4(), out = []
  for (const [m] of meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); const top = m.geometry.boundingBox.max.y
    for (let i = 0; i < m.count && out.length < 400; i += Math.max(1, Math.floor(m.count / 30))) {
      m.getMatrixAt(i, M); Wm.multiplyMatrices(m.matrixWorld, M); const P = new T.Vector3(0, top, 0).applyMatrix4(Wm), s = proj(P)
      if (s.z < -1 || s.z > 1 || s.x < 0 || s.y < 0 || s.x > size.x || s.y > size.y) continue
      const px = (metres) => { const q = proj(P.clone().addScaledVector(dir, metres)); return Math.hypot(q.x - s.x, q.y - s.y) }
      const mPerPx = 1 / px(1), floorM = v('uTreeWindFloorPx') * mPerPx
      const calm = crown(base, 0, floorM), peak = crown(base + gustAmp, 1, floorM)
      // crown lean shows as ≈1.7× its amp (lean 0.7 + hula 1); flutter at its amp
      const shown = (c) => 1.7 * c[0] + c[1]
      out.push({ steady: px(shown(calm.steady)), windRest: px(shown(calm.wind)), gustPeak: px(shown(peak.wind)), mPerPx })
    } }
  const q = (arr, k) => { const s = arr.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(k * s.length))].toFixed(2) }
  const by = (f) => [q(out.map(f), 0.1), q(out.map(f), 0.5), q(out.map(f), 0.9)]
  return { n: out.length, buffer: [size.x, size.y], live: { floorPx: v('uTreeWindFloorPx'), base: +base.toFixed(2), gustAmp: +gustAmp.toFixed(2) },
    steadyPx: by((o) => o.steady), windAtRestPx: by((o) => o.windRest), gustPeakWindPx: by((o) => o.gustPeak), mPerPx: by((o) => o.mPerPx) }
})()` }, S)
const v = r.result?.value
if (!v || v.error) { console.log('⛔', v?.error || JSON.stringify(r).slice(0, 300)); cleanup(); process.exit(1) }
const f = (a) => `${a[1]} px [${a[0]}–${a[2]}]`
console.log(`${TOWN} · ${SHOT} · ${MODE} · ${v.n} crowns · buffer ${v.buffer.join('×')} · live ${JSON.stringify(v.live)}`)
console.log(`  steady sway ${f(v.steadyPx)} · wind's part at rest ${f(v.windAtRestPx)} · wind's part at a GUST PEAK ${f(v.gustPeakWindPx)} · m/px ${f(v.mPerPx)}`)
const ok = v.gustPeakWindPx[0] >= v.live.floorPx - 0.01 || v.live.gustAmp < 1e-3
console.log(v.live.gustAmp < 1e-3 ? '  (the reading carries no gusts — the floor cannot fire, by design)' : ok ? `  ✅ gust peak ≥ ${v.live.floorPx} px on every sampled crown (p10)` : `  ⛔ gust peak below ${v.live.floorPx} px at p10`)
ws.close(); cleanup(); process.exit(ok ? 0 : 1)
