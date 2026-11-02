// pair.mjs <town> <seed> [throttle=4] [flights=3] — MEASURE ONLY. A PAIRED flight run on the Ward dev server (WARD_DEV_URL,
// default :5180): the movie's start phase is MovieCamera's `Math.random() * heroCycleSec` (start 'random', no knob), so the
// HARNESS seeds Math.random before the page loads (a mulberry32 PRNG from <seed>, via Page.addScriptToEvaluateOnNewDocument).
// No source hook: the same seed gives the same phases in every arm, as long as the code draws the same random numbers before
// each movie entry. ⭐ Pairing is CHECKED, not assumed: the camera position at each tap is recorded (dev's
// window.__wardMap.cameraRef), and the report gives each pair's pose distance.
// Per flight to Society: frames, worst, the 5 longest, landing time, and the JS heap after landing (CDP Runtime.getHeapUsage,
// after a forced collection), so the memory sits beside the frame time. Between flights: back Home, which re-enters the
// movie (a new seeded phase). No profiler: its sampling would perturb the frame times being compared.
import { pathToFileURL } from 'node:url'
const KIT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const { launch, sleep } = await import(pathToFileURL(KIT + '/scripts/lib/headless.mjs').href)
const [town, seed, thr = '4', nFlights = '3'] = process.argv.slice(2)
if (!town || !seed) throw new Error('usage: pair.mjs <town> <seed> [throttle] [flights]')
const DEV = process.env.WARD_DEV_URL || 'http://localhost:5180/'
const W = [1440, 900]
const SEEDED = `(() => { let a = ${(+seed >>> 0) || 1} >>> 0; Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })();`
const chrome = await launch({ windowSize: W.join(',') })
const out = { town, seed: +seed, throttle: +thr, dev: DEV, flights: [] }
try {
  const page = await chrome.openPage()
  for (const d of ['Page', 'Runtime', 'HeapProfiler']) await page.send(d + '.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: W[0], height: W[1], deviceScaleFactor: 2, mobile: false })
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: SEEDED })
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  page.on('Fetch.requestPaused', ({ requestId, request }) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) page.send('Fetch.continueRequest', { requestId }).catch(() => {})
    else page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {})
  })
  const ev = async (expression) => { const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300)); return r.result?.value }
  const heapMB = async () => { await page.send('HeapProfiler.collectGarbage'); const h = await page.send('Runtime.getHeapUsage'); return +(h.usedSize / 1e6).toFixed(1) }
  await page.send('Page.navigate', { url: new URL(`/${town}/`, DEV).href })
  let ok = false
  for (let i = 0; i < 600; i++) { await sleep(250); if (await ev(`performance.getEntriesByName('ward:reveal').length > 0 && !!document.querySelector('.band__room') && !!window.__wardMap`).catch(() => false)) { ok = true; break } }
  if (!ok) throw new Error('never revealed (or no __wardMap: not the dev server?)')
  out.reveal = await ev(`Math.round(performance.getEntriesByName('ward:reveal')[0].startTime)`)
  await sleep(4000)
  out.heapAtRestMB = await heapMB()
  if (+thr > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: +thr })
  const fly = (room, to) => ev(`(async () => {
    const a = [...document.querySelectorAll('.band__room')].find(e => e.textContent.trim() === ${JSON.stringify(room)})
    if (!a) return { why: 'no ${room} room' }
    const cam = window.__wardMap.cameraRef.current, at = cam ? cam.position.toArray().map(v => +v.toFixed(2)) : null
    const d = []; let last = 0, landedAt = null, go = true, seen = false
    const f = (t) => { if (last) d.push(Math.round(t - last)); last = t
      const fl = window.__wardMap.flightRef.current
      if (fl && fl.to === ${JSON.stringify(to)} && !fl.landed) seen = true
      if (landedAt == null && seen && fl && fl.to === ${JSON.stringify(to)} && (fl.landed || fl.interrupted)) landedAt = performance.now()
      if (landedAt != null && performance.now() - landedAt > 500) go = false
      if (go && d.length < 3000) requestAnimationFrame(f) }
    const t0 = performance.now(); a.click(); requestAnimationFrame(f)
    while (go && performance.now() - t0 < 40000) await new Promise(r => setTimeout(r, 50))
    const s = [...d].sort((x, y) => y - x)
    return { at, landed: landedAt != null, ms: landedAt ? Math.round(landedAt - t0) : null, frames: d.length, worst: s[0], top: s.slice(0, 5), median: [...d].sort((x, y) => x - y)[d.length >> 1] }
  })()`)
  for (let k = 1; k <= +nFlights; k++) {
    const r = await fly('Society', 'plan')
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 }); const heap = await heapMB(); if (+thr > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: +thr })
    await sleep(1500)
    const back = await fly('Home', 'movie')
    out.flights.push({ k, ...r, heapAfterMB: heap, back: { worst: back.worst, ms: back.ms } })
    await sleep(3000)
  }
} catch (e) { out.error = String(e.message || e) } finally { await chrome.close() }
const { execSync } = await import('node:child_process'); out.load = execSync('sysctl -n vm.loadavg').toString().trim()
console.log(JSON.stringify(out))
