// probe.mjs <town> <desktop|phone> <throttle> — MEASURE ONLY, staging. Reuses the kit's headless.mjs and the frame
// recorder of theward/checks/society-flight-has-no-long-frame.mjs; adds Network bytes, CPU throttle, LoAF attribution.
import { pathToFileURL } from 'node:url'
const KIT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const { launch, sleep } = await import(pathToFileURL(KIT + '/scripts/lib/headless.mjs').href)
const [town, device = 'desktop', thr = '1'] = process.argv.slice(2)
const BASE = process.env.STAGING || 'https://staging.theward.online/'
const W = device === 'phone' ? [390, 844] : device === 'half' ? [720, 450] : [1440, 900]
const chrome = await launch({ windowSize: W.join(',') })
const out = { town, device, throttle: +thr }
try {
  const page = await chrome.openPage()
  for (const d of ['Page', 'Runtime', 'Network']) await page.send(d + '.enable')
  await page.send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.send('Emulation.setDeviceMetricsOverride', { width: W[0], height: W[1], deviceScaleFactor: device === 'phone' ? 3 : 2, mobile: device === 'phone' })
  if (device === 'phone') {
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await page.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  }
  if (+thr > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: +thr })
  // no writes, as the check does
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  page.on('Fetch.requestPaused', ({ requestId, request }) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) page.send('Fetch.continueRequest', { requestId }).catch(() => {})
    else page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {})
  })
  const req = new Map()
  page.on('Network.requestWillBeSent', ({ requestId, request }) => req.set(requestId, { url: request.url, bytes: 0, t: null }))
  page.on('Network.responseReceived', ({ requestId, response }) => { const r = req.get(requestId); if (r) { r.status = response.status; r.mime = response.mimeType } })
  page.on('Network.loadingFinished', ({ requestId, encodedDataLength, timestamp }) => { const r = req.get(requestId); if (r) { r.bytes = encodedDataLength; r.done = timestamp } })
  page.on('Network.loadingFailed', ({ requestId, errorText }) => { const r = req.get(requestId); if (r) r.failed = errorText })
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__loaf = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration||0), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), scripts: (e.scripts||[]).map(s => ({ d: Math.round(s.duration), inv: s.invoker, src: (s.sourceURL||'').split('/').pop() + ':' + (s.sourceFunctionName||'') })) }) }).observe({ type: 'long-animation-frame', buffered: true }) } catch {}` })
  const ev = async (expression) => { const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300)); return r.result?.value }
  const t0 = Date.now()
  await page.send('Page.navigate', { url: new URL(`/${town}/`, BASE).href })
  let marks = {}
  for (let i = 0; i < 600; i++) { await sleep(250); marks = await ev(`Object.fromEntries(performance.getEntriesByType('mark').filter(m => m.name.startsWith('ward:')).map(m => [m.name.slice(5), Math.round(m.startTime)]))`).catch(() => ({})); if (marks['first-truthful-frame'] && marks.reveal) break; if (Object.keys(marks).some(k => k.startsWith('failed:'))) break }
  out.marks = marks
  if (!marks.reveal) { out.why = 'never revealed in 150 s'; throw 0 }
  await sleep(4000) // the band settles; Home's movie plays
  const bytes = () => { const cls = { slab: 0, wardJs: 0, kit: 0, photos: 0, other: 0 }, n = { slab: 0, wardJs: 0, kit: 0, photos: 0, other: 0 }, top = []
    for (const r of req.values()) { const u = new URL(r.url); if (u.protocol === 'data:' || u.protocol === 'blob:') continue
      const p = u.pathname
      const k = /\/baked\//.test(p) && !/photo/i.test(p) ? 'slab'
        : /photo|\/images?\//i.test(p) || (/^image\//.test(r.mime || '') && !/\/baked\/|\/(basis|textures|trees|models|clouds)\//.test(p) && !/_ward/.test(p)) ? 'photos'
        : u.host.startsWith('staging.theward') && /\/_ward\//.test(p) ? 'wardJs'
        : /\/(basis|clouds|textures|models|trees|looks|kit)\//.test(p) || /_kit/.test(p) ? 'kit' : 'other'
      cls[k] += r.bytes; n[k]++; top.push([r.bytes, k, u.host + p.slice(0, 90), r.failed || r.status]) }
    return { cls, n, total: Object.values(cls).reduce((a, b) => a + b, 0), count: req.size, top: top.sort((a, b) => b[0] - a[0]).slice(0, 12), other: top.filter(t => t[1] === 'other').slice(0, 15) } }
  out.load = bytes()
  out.loadWallS = Math.round((Date.now() - t0) / 100) / 10
  // the flight Home -> Society, recorded as the Ward check does; landing read from --rise (Scene.jsx writes the flight's eased curve)
  out.flight = await ev(`(async () => {
    const frames = (ms) => new Promise(done => { const d = []; let last = 0; const t0 = performance.now()
      const f = (t) => { if (last) d.push(t - last); last = t; if (performance.now() - t0 < ms) requestAnimationFrame(f); else done(d) }; requestAnimationFrame(f) })
    const rest = (await frames(2000)).sort((a, b) => a - b), interval = rest[rest.length >> 1]
    const a = [...document.querySelectorAll('.band__room')].find(e => e.textContent.trim() === 'Society')
    if (!a) return { why: 'no Society room' }
    const rise = () => getComputedStyle(document.documentElement).getPropertyValue('--rise').trim()
    const d = []; let last = 0, sawMove = false, landedAt = null, go = true, loaf0 = window.__loaf.length
    const f = (t) => { if (last) d.push(Math.round(t - last)); last = t
      const r = rise(); if (r !== '' && +r < 1) sawMove = true
      if (landedAt == null && sawMove && +r >= 1) landedAt = performance.now()
      if (landedAt != null && performance.now() - landedAt > 1000) go = false
      if (go && d.length < 3000) requestAnimationFrame(f) }
    const t0 = performance.now(); a.click(); requestAnimationFrame(f)
    while (go && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 100))
    const s = [...d].sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
    return { rest: Math.round(interval * 10) / 10, landed: landedAt != null, flightMs: landedAt ? Math.round(landedAt - t0) : null, frames: d.length, median: q(0.5), p95: q(0.95), max: s[s.length - 1], long50: d.filter(x => x > 50), loaf: window.__loaf.slice(loaf0).filter(e => e.d > 50) }
  })()`)
  await sleep(2500)
  // Browse: pan at the plan's default camera (Society's plan), mouse drags across the canvas centre
  const before = await ev(`window.__loaf.length`)
  const rec = ev(`new Promise(done => { const d = []; let last = 0; const t0 = performance.now(); const f = (t) => { if (last) d.push(Math.round(t - last)); last = t; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else done(d) }; requestAnimationFrame(f) })`)
  const cx = W[0] * (device === 'phone' ? 0.5 : 0.65), cy = W[1] * 0.45
  const touch = device === 'phone'
  const at = async (type, x, y) => touch
    ? page.send('Input.dispatchTouchEvent', { type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd' }[type], touchPoints: type === 'up' ? [] : [{ x, y }] })
    : page.send('Input.dispatchMouseEvent', { type: { down: 'mousePressed', move: 'mouseMoved', up: 'mouseReleased' }[type], x, y, button: 'left', buttons: type === 'up' ? 0 : 1, clickCount: 1 })
  for (let k = 0; k < 3; k++) {
    await at('down', cx, cy)
    for (let i = 1; i <= 40; i++) { await at('move', cx + Math.sin(i / 40 * Math.PI) * 160 * (k % 2 ? -1 : 1), cy + i * 2); await sleep(16) }
    await at('up', cx, cy + 80)
  }
  const pd = await rec
  const s = [...pd].sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  out.pan = { frames: pd.length, median: q(0.5), p95: q(0.95), max: s[s.length - 1], long50: pd.filter(x => x > 50).length, loaf: (await ev(`window.__loaf.slice(${before}).filter(e => e.d > 50)`)).slice(0, 8) }
  out.afterAll = bytes()
  out.gpu = await ev(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(e.UNMASKED_RENDERER_WEBGL) })()`).catch(e => 'unread: ' + e.message)
  out.dpr = await ev('devicePixelRatio')
} catch (e) { if (e) out.error = String(e.message || e) } finally { await chrome.close() }
const { execSync } = await import('node:child_process'); out.loadEnd = execSync('sysctl -n vm.loadavg').toString().trim()
console.log(JSON.stringify(out))
