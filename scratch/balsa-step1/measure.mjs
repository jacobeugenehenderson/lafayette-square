// Plumb, 2026-10-27: step 1 of BRIEF-the-balsa-model-LANDED-2026-10-28 on staging. Reads only: ward: startup marks, rAF, CDP Profiler, Network.
import { launch, sleep } from './cdp.mjs'
import { writeFileSync } from 'node:fs'
const town = process.argv[2], dev = process.argv[3] || 'desktop'
const PHONE = dev === 'phone'
const W = PHONE ? 390 : 1512, H = PHONE ? 844 : 982
const b = await launch(PHONE ? { W: 390, H: 844, DPR: 3 } : { W, H, DPR: 2 })
const out = { town, dev }
await b.cdp('Page.enable'); await b.cdp('Runtime.enable'); await b.cdp('Network.enable')
await b.cdp('Network.setCacheDisabled', { cacheDisabled: true })
if (PHONE) {
  await b.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await b.cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' })
  await b.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await b.cdp('Emulation.setCPUThrottlingRate', { rate: 4 })
}
const req = new Map()
b.on((m) => {
  if (m.method === 'Network.requestWillBeSent') req.set(m.params.requestId, { url: m.params.request.url, t0: m.params.timestamp })
  if (m.method === 'Network.loadingFinished') { const r = req.get(m.params.requestId); if (r) { r.bytes = m.params.encodedDataLength; r.t1 = m.params.timestamp } }
})
await b.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__raf = []; (function f(t) { window.__raf.push(t); requestAnimationFrame(f) })(0)
  window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true }) } catch {}
` })
await b.cdp('Profiler.enable'); await b.cdp('Profiler.setSamplingInterval', { interval: 500 }); await b.cdp('Profiler.start')
const tNav = Date.now()
await b.cdp('Page.navigate', { url: `https://staging.theward.online/${town}/` })
let ok = false
for (let i = 0; i < 600; i++) { await sleep(200); if (await b.js("performance.getEntriesByName('ward:first-truthful-frame').length > 0")) { ok = true; break } }
out.loadWall = Date.now() - tNav; out.revealed = ok
const profLoad = (await b.cdp('Profiler.stop')).profile
out.marks = await b.js(`Object.fromEntries([...performance.getEntriesByType('mark').filter(m => m.name.startsWith('ward:')).map(m => [m.name.slice(5), Math.round(m.startTime)]), ...performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)])])`)
out.build = await b.js(`document.querySelector('script[src*="/_ward/"]')?.src.match(/_ward\\/([0-9a-f]+)/)?.[1]`)
// ── MOVE: gesture into Browse at once, then pan + zoom continuously ──
const tMove = await b.js('performance.now()')
await b.cdp('Profiler.start')
const cx = Math.round(W / 2), cy = Math.round(H * 0.55)
const drag = async (dx, dy, steps = 30) => {
  if (PHONE) {
    await b.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] })
    for (let i = 1; i <= steps; i++) { await b.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + dx * i / steps, y: cy + dy * i / steps }] }); await sleep(16) }
    await b.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await b.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 })
    for (let i = 1; i <= steps; i++) { await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + dx * i / steps, y: cy + dy * i / steps, button: 'left', buttons: 1 }); await sleep(16) }
    await b.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + dx, y: cy + dy, button: 'left', buttons: 0, clickCount: 1 })
  }
}
const pinch = async (sign) => { // phone zoom: two-finger spread / pinch
  const d0 = 60, d1 = sign > 0 ? 140 : 30
  for (let i = 0; i <= 20; i++) { const d = d0 + (d1 - d0) * i / 20; await b.cdp('Input.dispatchTouchEvent', { type: i ? 'touchMove' : 'touchStart', touchPoints: [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] }); await sleep(16) }
  await b.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const wheel = async (dy) => { for (let i = 0; i < 12; i++) { await b.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: dy }); await sleep(16) } }
await drag(-80, 0, 10) // the gesture that leaves Hero
const tEnd = Date.now() + 16000
let k = 0
while (Date.now() < tEnd) {
  const s = (k % 2) ? 1 : -1
  await drag(s * W * 0.3, s * H * 0.08)
  if (PHONE) await pinch(s); else await wheel(s * 100)
  k++
}
const profMove = (await b.cdp('Profiler.stop')).profile
const tMoveEnd = await b.js('performance.now()')
// ── HOVER: pointer moves with no button (desktop only; a phone has no hover) ──
let profHover = null, tHov = null
if (!PHONE) {
  await sleep(1500)
  tHov = await b.js('performance.now()')
  await b.cdp('Profiler.start')
  for (let i = 0; i < 180; i++) { await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(W * 0.2 + (i % 60) * W * 0.01), y: Math.round(H * (0.35 + 0.1 * Math.floor(i / 60))), buttons: 0 }); await sleep(16) }
  profHover = (await b.cdp('Profiler.stop')).profile
  tHov = [tHov, await b.js('performance.now()')]
}
// ── CLICK → CARD ──
await sleep(2500)
await b.js(`(() => { window.__mut = []; new MutationObserver(ms => { let n = 0; for (const m of ms) for (const a of m.addedNodes) n += (a.textContent || '').length; if (n) window.__mut.push([performance.now(), n]) }).observe(document.body, { childList: true, subtree: true });
  window.__clk = []; window.addEventListener('pointerup', () => window.__clk.push(performance.now()), true) })()`)
writeFileSync(`preclick-${town}-${dev}.png`, Buffer.from((await b.cdp("Page.captureScreenshot", { format: "png" })).data, "base64"))
const before = await b.js('document.body.innerText.length')
out.click = null
await b.cdp('Profiler.start')
const pts = []; for (const fy of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65]) for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) pts.push([Math.round(W * fx), Math.round(H * fy)])
for (const [x, y] of pts) {
  const m0 = await b.js('window.__mut.length')
  if (PHONE) { await b.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await b.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
  else { await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 }); await sleep(50); await b.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await b.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }) }
  await sleep(2500)
  const r = await b.js(`(() => { const c = window.__clk.at(-1); const ms = window.__mut.slice(${'${m0}'}).filter(m => m[0] >= c); const big = ms.find(m => m[1] > 40); const raf = big ? window.__raf.find(t => t > big[0]) : null; return { c, first: ms[0] && ms[0][0] - c, big: big && big[0] - c, paint: raf && raf - c, added: ms.reduce((s, m) => s + m[1], 0), textLen: document.body.innerText.length } })()`.replace("${'${m0}'}", m0))
  if (r.big != null && r.textLen - before > 40) { out.click = { x, y, ...r, dom: r.big, firstPaint: r.paint }; writeFileSync(`card-${town}-${dev}.png`, Buffer.from((await b.cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64')); break }
}
const profClick = (await b.cdp('Profiler.stop')).profile
// ── frames ──
const raf = await b.js('window.__raf')
out.lt = await b.js('window.__lt')
out.frames = { tMove, tMoveEnd, tHov }
writeFileSync(`raw-${town}-${dev}.json`, JSON.stringify({ out, raf, req: [...req.values()], profLoad, profMove, profHover, profClick }))
console.log(JSON.stringify(out))
b.close(); process.exit(0)
