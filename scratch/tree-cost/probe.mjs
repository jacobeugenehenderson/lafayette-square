// Tree-cost forensic probe (Grain, 2026-10-04; BRIEF-tree-cost-forensic). READ-ONLY: drives the running
// :5173 Preview headless (Plumb's method: Page.enable + addScriptToEvaluateOnNewDocument for the tier) and
// mutates only the page's memory (visibility toggles, a runtime grid swap on the overhead quads, pixel ratio).
//
//   node scratch/tree-cost/probe.mjs --town=lafayette-square --mode=desktop --shot=browse [--grids=28,16,8,4,1]
//
// Classes, read off geometry (never off names): mesh = has aBark · overhead = aOverhead + flat (y extent 0) ·
// hero = aOverhead + vertical · impostor = aHeroTier without aBark · tree? = any other instanced mesh with aGroundRaw.
// GPU ms = frameCost.js#gpuWindow (fresh frames only), THIS desktop's GPU. Toggle delta = mean(rest) − off.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = arg('town', 'lafayette-square'), MODE = arg('mode', 'desktop'), SHOT = arg('shot', 'browse')
const BASE = arg('base', 'http://localhost:5173')
const GRIDS = arg('grids', '28,16,8,4,1').split(',').map(Number)
const TRIS_ONLY = process.argv.includes('--tris-only')   // census + arrival only: no GPU timing (safe while the GPU is shared)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'tree-cost-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' })
// ⛔ chrome.kill alone leaked every run's browser (6 orphans, 2026-10-04): kill by the profile path too.
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error(e); cleanup(); process.exit(1) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
const pageErrors = []
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push('ERR ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)) }

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.mode.v1', '${MODE}'); localStorage.setItem('cartograph-last-stage-shot', '${SHOT === 'street' ? 'browse' : SHOT}')` }, S)
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result?.value }
const t0 = Date.now()
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)

// In-page helpers, installed once the renderer exists.
const HELPERS = `(() => {
  if (window.__tc) return true
  if (!window.__scene || !window.__renderer) return false
  const sc = window.__scene
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true }
  const cls = (o) => { const g = o.geometry, a = g?.attributes; if (!a) return null
    if (a.aBark) return 'mesh'
    if (a.aOverhead) { if (!g.boundingBox) g.computeBoundingBox(); return (g.boundingBox.max.y - g.boundingBox.min.y) < 1e-3 ? 'overhead' : 'hero' }
    if (a.aHeroTier) return 'impostor'
    if (o.isInstancedMesh && a.aGroundRaw) return 'tree?'
    return null }
  const tris = (o) => { const g = o.geometry; const n = g.index ? g.index.count : (g.attributes.position?.count || 0); return Math.min(n, g.drawRange?.count ?? Infinity) / 3 * (o.isInstancedMesh ? o.count : 1) }
  const census = () => { const out = {}; sc.traverse((o) => { if (!o.isMesh) return; const c = cls(o); if (!c) return
      const e = out[c] ||= { meshes: 0, shownMeshes: 0, tris: 0, shownTris: 0, instances: 0, trisPerInst: new Set(), texReady: 0, texTotal: 0, where: new Set() }
      const t = tris(o); e.meshes++; e.tris += t
      if (shown(o)) { e.shownMeshes++; e.shownTris += t; e.instances += o.isInstancedMesh ? o.count : 1; e.trisPerInst.add((o.geometry.index ? o.geometry.index.count : 0) / 3); if (c === 'tree?') { let n = ''; for (let p = o; p; p = p.parent) if (p.name) { n = p.name; break } e.where.add(n || '(unnamed)') }
        const m = o.material; if (m?.map) { e.texTotal++; if (m.map.image) e.texReady++ } } })
    for (const e of Object.values(out)) { e.trisPerInst = [...e.trisPerInst].sort((a, b) => a - b); e.where = [...e.where] }
    return out }
  const meshesOf = (c) => { const xs = []; sc.traverse((o) => { if (o.isMesh && cls(o) === c && shown(o)) xs.push(o) }); return xs }
  // Rebuild buildOverheadBandDisc's quad at grid N from the live geometry (half-side + y from its bbox), keeping
  // the instanced attributes by reference. N=1 → the flat 2-tri quad.
  const swapGrid = (o, N) => { const g0 = o.userData.__tcOrig || (o.userData.__tcOrig = o.geometry)
    if (N === 'orig') { if (o.geometry !== g0) { o.geometry = g0 } return }
    const T = g0.constructor, bb = g0.boundingBox || (g0.computeBoundingBox(), g0.boundingBox)
    const half = (bb.max.x - bb.min.x) / 2, y = bb.max.y, hn = g0.attributes.aTreeHeightNorm.array[0]
    const P = [], U = [], A = [], H = [], I = []
    for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) { const u = ix / N, v = iz / N; P.push((u * 2 - 1) * half, y, (v * 2 - 1) * half); U.push(u, v); A.push(1); H.push(hn) }
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) { const a = iz * (N + 1) + ix, b = a + 1, c = a + (N + 1), d = c + 1; I.push(a, c, b, b, c, d) }
    const g = new T(); const BA = g0.attributes.position.constructor
    g.setAttribute('position', new BA(new Float32Array(P), 3)); g.setAttribute('uv', new BA(new Float32Array(U), 2))
    g.setAttribute('aOverhead', new BA(new Float32Array(A), 1)); g.setAttribute('aTreeHeightNorm', new BA(new Float32Array(H), 1))
    for (const [k, v] of Object.entries(g0.attributes)) if (v.isInstancedBufferAttribute) g.setAttribute(k, v)
    g.setIndex(I); g.boundingSphere = g0.boundingSphere; g.boundingBox = g0.boundingBox
    o.geometry = g }
  const unknownAttrs = () => { const known = new Set(['position', 'uv', 'aOverhead', 'aTreeHeightNorm']); const xs = new Set()
    for (const o of meshesOf('overhead')) for (const [k, v] of Object.entries((o.userData.__tcOrig || o.geometry).attributes)) if (!v.isInstancedBufferAttribute && !known.has(k)) xs.add(k)
    return [...xs] }
  let fc = null
  // The SAME module instance the app imported (Vite may serve it with a ?t= stamp; a bare import is a second, empty instance).
  const fcUrl = () => performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/preview/frameCost.js'))
  const gpu = async (ms) => { fc ||= await import(fcUrl()); const r = await fc.gpuWindow(ms); if (!r.n) throw new Error('gpuWindow saw no frames from ' + fcUrl()); return r }
  window.__tc = { census, meshesOf, swapGrid, unknownAttrs, gpu, shown }
  return true
})()`

const M = (n) => (n / 1e6).toFixed(2) + 'M'
const log = []
const say = (s) => { console.log(s); log.push(s) }
say(`== ${TOWN} · ${SHOT} · ${MODE} · headless Chrome, this desktop's GPU (M1) ==`)

// ⛔ A cold load straight into Street throws in ShotFlight (no streetAt until the stencil loads), so Street is entered
// the operator's way: load Browse, wait, press the Street button. Its 'arrival' is the shot change, not the page load.
if (SHOT === 'street') {
  for (let i = 0; i < 60; i++) { await sleep(1000); if (await js(`!!window.__renderer && !![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Street')`)) break }
  await sleep(6000)
  say('  pressed Street: ' + await js(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Street'); if (!b) return 'NO BUTTON'; b.click(); return 'ok' })()`))
}
// ── ARRIVAL: sample once a second from navigation until the overhead (browse) or tree set is resident ─────────────
const arrival = []
let resident = false, residentAt = null
for (let s = 0; s < 90; s++) {
  await sleep(1000)
  let ok = false; try { ok = await js(HELPERS) } catch {}
  if (!ok) continue
  const v = await js(`(() => { const c = __tc.census(); const f = window.__previewFrame?.(); return { c, f: f ? { tris: f.tris, calls: f.calls, gpuMs: f.gpuMs, target: f.target } : null } })()`)
  const el = ((Date.now() - t0) / 1000).toFixed(0)
  const row = Object.entries(v.c).filter(([, e]) => e.shownMeshes).map(([k, e]) => `${k} ${e.shownMeshes}m/${M(e.shownTris)}${e.texTotal ? ` tex ${e.texReady}/${e.texTotal}` : ''}`).join(' · ') || '(no tree shown)'
  arrival.push({ t: +el, c: v.c, f: v.f })
  say(`  t+${el.padStart(2)}s  ${row}  | frame tris ${v.f ? M(v.f.tris) : '—'} gpu ${v.f?.gpuMs?.toFixed(1) ?? '—'} [${v.f?.target}]`)
  const oh = v.c.overhead, want = SHOT === 'browse'
  const isRes = want ? (oh && oh.shownMeshes && oh.texReady === oh.texTotal && oh.texTotal > 0) : (Object.values(v.c).some((e) => e.shownMeshes) && !Object.values(v.c).some((e) => e.texTotal && e.texReady < e.texTotal))
  if (isRes && !resident) { resident = true; residentAt = +el }
  if (resident && +el >= residentAt + 6) break
}
for (const x of [...new Set(pageErrors)].slice(0, 8)) say('  page ' + x)
say(resident ? `  resident at t+${residentAt}s` : '  ⛔ never resident within 90 s; the at-rest numbers below are NOT steady state')
await sleep(TRIS_ONLY ? 3000 : 8000)

// ── TIER confirmation (Plumb's rule: confirm the tier live before trusting it) ──────────────────────────────────
const tier = await js(`(() => { const gl = window.__renderer; return { stored: localStorage.getItem('preview.mode.v1'), target: window.__previewFrame?.().target, dpr: gl.getPixelRatio(), buf: gl.domElement.width + 'x' + gl.domElement.height, logDepth: gl.capabilities.logarithmicDepthBuffer, shadows: gl.shadowMap.enabled } })()`)
say(`  tier: ${JSON.stringify(tier)}`)

// ── AT REST: census + per-component toggle deltas ───────────────────────────────────────────────────────────────
const W = 2500, SET = 1500
const rest = async () => (await js(`__tc.gpu(${W})`))
const census = await js(`__tc.census()`)
say(`  AT REST census (shown): ` + Object.entries(census).filter(([, e]) => e.shownMeshes).map(([k, e]) => `${k}: ${e.shownMeshes} meshes, ${e.instances} inst, ${M(e.shownTris)} tris, tris/inst ${e.trisPerInst.join('|')}${e.where.length ? ' under ' + e.where.join(',') : ''}`).join(' · '))
say(`  hidden (mounted, not shown): ` + Object.entries(census).map(([k, e]) => `${k} ${e.meshes - e.shownMeshes}m/${M(e.tris - e.shownTris)}`).join(' · '))
const frame0 = await js(`window.__previewFrame()`)
say(`  frame (all passes, GpuMonitor): ${frame0.calls} draws · ${M(frame0.tris)} tris · gpu ${frame0.gpuMs?.toFixed(1)} ms`)

const toggle = async (label, classes) => {
  if (TRIS_ONLY) { const before = await js(`(${JSON.stringify(classes)}).reduce((s, c) => s + __tc.meshesOf(c).length, 0)`); await js(`window.__tcHidden = (${JSON.stringify(classes)}).flatMap((c) => __tc.meshesOf(c)); __tcHidden.forEach((o) => { o.visible = false }); true`); await sleep(800); const f = await js(`window.__previewFrame()`); await js(`__tcHidden.forEach((o) => { o.visible = true }); true`); await sleep(500); say(`  off ${label.padEnd(18)} hid ${before} meshes · frame ${f.calls} draws, ${M(f.tris)} tris`); return { label, offTris: f.tris, offCalls: f.calls } }
  const r1 = await rest()
  const before = await js(`(${JSON.stringify(classes)}).reduce((s, c) => s + __tc.meshesOf(c).length, 0)`)
  await js(`window.__tcHidden = (${JSON.stringify(classes)}).flatMap((c) => __tc.meshesOf(c)); __tcHidden.forEach((o) => { o.visible = false }); true`)
  await sleep(SET); const out = await rest()
  const fOut = await js(`window.__previewFrame()`)
  const stillShown = await js(`(${JSON.stringify(classes)}).reduce((s, c) => s + __tc.meshesOf(c).length, 0)`)
  await js(`__tcHidden.forEach((o) => { o.visible = true }); true`)
  await sleep(SET); const r2 = await rest()
  const d = (r1.ms + r2.ms) / 2 - out.ms
  say(`  off ${label.padEnd(18)} hid ${before} meshes (still shown after: ${stillShown}) · Δgpu ${d.toFixed(1)} ms of ${((r1.ms + r2.ms) / 2).toFixed(1)} (noise ±${(Math.abs(r1.ms - r2.ms) / 2).toFixed(1)}, n ${r1.n}/${out.n}/${r2.n}) · frame tris off ${M(fOut.tris)}`)
  return { label, d, rest: (r1.ms + r2.ms) / 2, noise: Math.abs(r1.ms - r2.ms) / 2 }
}
const present = Object.entries(census).filter(([, e]) => e.shownMeshes).map(([k]) => k)
const results = { town: TOWN, shot: SHOT, mode: MODE, tier, arrival, residentAt, census, frame0, toggles: [], pixels: [], grids: [] }
for (const c of present) results.toggles.push(await toggle(c, [c]))
if (present.length > 1) results.toggles.push(await toggle('all trees', present))

if (TRIS_ONLY) { const out = join(dirname(fileURLToPath(import.meta.url)), 'runs'); mkdirSync(out, { recursive: true }); writeFileSync(join(out, `${TOWN}-${SHOT}-${MODE}-tris.json`), JSON.stringify({ ...results, log }, null, 1)); ws.close(); cleanup(); process.exit(0) }
// ── PIXELS: does the trees' ms scale with pixel count? Halve the pixel ratio (¼ the pixels) ────────────────────
const pr0 = tier.dpr
for (const k of [1, 0.5]) {
  await js(`window.__renderer.setPixelRatio(${pr0 * k}); true`); await sleep(SET)
  const buf = await js(`window.__renderer.domElement.width + 'x' + window.__renderer.domElement.height`)
  say(`  ── pixel ratio ×${k} (buffer ${buf})`)
  const t = await toggle('all trees @px×' + k, present)
  results.pixels.push({ k, buf, ...t })
}
await js(`window.__renderer.setPixelRatio(${pr0}); true`); await sleep(SET)

// ── GRID: the overhead quad rebuilt at N in-page (no src edit; ⛔ no URL override exists for the overhead grid) ───
if (present.includes('overhead')) {
  say(`  overhead non-instanced attributes not rebuilt by the swap: ${JSON.stringify(await js(`__tc.unknownAttrs()`))}`)
  for (const N of GRIDS) {
    await js(`__tc.meshesOf('overhead').forEach((o) => __tc.swapGrid(o, ${N})); true`); await sleep(SET)
    const g = await rest(); const f = await js(`window.__previewFrame()`)
    const oh = (await js(`__tc.census()`)).overhead
    say(`  grid ${String(N).padStart(2)}: overhead ${M(oh.shownTris)} tris (tris/inst ${oh.trisPerInst.join('|')}) · frame ${M(f.tris)} · gpu ${g.ms?.toFixed(1)} ms (n ${g.n})`)
    results.grids.push({ N, ohTris: oh.shownTris, frameTris: f.tris, gpuMs: g.ms, n: g.n })
  }
  await js(`__tc.meshesOf('overhead').forEach((o) => __tc.swapGrid(o, 'orig')); true`); await sleep(SET)
  const g = await rest(); say(`  grid restored: gpu ${g.ms?.toFixed(1)} ms`)
}

const out = join(dirname(fileURLToPath(import.meta.url)), 'runs'); mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${TOWN}-${SHOT}-${MODE}.json`), JSON.stringify({ ...results, log }, null, 1))
ws.close(); cleanup(); process.exit(0)
