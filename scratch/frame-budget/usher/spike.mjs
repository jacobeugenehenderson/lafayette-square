// spike.mjs <town> [throttle=4] [flights=3] — MEASURE ONLY. CPU-profiles the Home -> Society flight on the Ward dev server
// (WARD_DEV_URL, default :5180, unminified ESM) and names the work in its worst frames, down to the kit function.
// A "frame" is a run of consecutive profile samples under R3F's `loop` (its requestAnimationFrame callback); no clock
// mapping is needed. ⛔ That in-run matcher looked for R3F's loop by URL and found none (Vite bundles it into a chunk-*.js),
// so it is removed: attribution is offline in spike-analyse.mjs, by busy span. Flies Society, back Home, Society again, so a one-off (compile, upload, first use) shows in flight 1
// only and repeated work shows in every flight. Landing is read from window.__wardMap.flightRef (dev only).
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
const KIT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const { launch, sleep } = await import(pathToFileURL(KIT + '/scripts/lib/headless.mjs').href)
const [town, thr = '4', nFlights = '3'] = process.argv.slice(2)
const DEV = process.env.WARD_DEV_URL || 'http://localhost:5180/'
const W = [1440, 900]
const chrome = await launch({ windowSize: W.join(',') })
const out = { town, throttle: +thr, dev: DEV, flights: [] }
const raw = []
try {
  const page = await chrome.openPage()
  for (const d of ['Page', 'Runtime', 'Profiler']) await page.send(d + '.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: W[0], height: W[1], deviceScaleFactor: 2, mobile: false })
  // SEED=<n>: the movie's start phase seeded as pair.mjs does (Math.random, before the page loads); only the FIRST flight pairs
  if (process.env.SEED) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { let a = ${(+process.env.SEED >>> 0) || 1} >>> 0; Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })();` })
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  page.on('Fetch.requestPaused', ({ requestId, request }) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) page.send('Fetch.continueRequest', { requestId }).catch(() => {})
    else page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {})
  })
  const ev = async (expression) => { const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300)); return r.result?.value }
  await page.send('Page.navigate', { url: new URL(`/${town}/`, DEV).href })
  let ok = false
  for (let i = 0; i < 600; i++) { await sleep(250); if (await ev(`performance.getEntriesByName('ward:reveal').length > 0 && !!document.querySelector('.band__room')`).catch(() => false)) { ok = true; break } }
  if (!ok) throw new Error('never revealed')
  out.marks = await ev(`Object.fromEntries(performance.getEntriesByType('mark').filter(m => m.name.startsWith('ward:')).map(m => [m.name.slice(5), Math.round(m.startTime)]))`)
  await sleep(4000)
  if (+thr > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: +thr })
  await page.send('Profiler.setSamplingInterval', { interval: 200 })
  const fly = (room, to) => ev(`(async () => {
    const a = [...document.querySelectorAll('.band__room')].find(e => e.textContent.trim() === ${JSON.stringify(room)})
    if (!a) return { why: 'no ${room} room' }
    const d = []; let last = 0, landedAt = null, go = true, seen = false
    const f = (t) => { if (last) d.push(Math.round(t - last)); last = t
      const fl = window.__wardMap?.flightRef.current
      if (fl && fl.to === ${JSON.stringify(to)} && !fl.landed) seen = true
      if (landedAt == null && seen && fl && fl.to === ${JSON.stringify(to)} && (fl.landed || fl.interrupted)) landedAt = performance.now()
      if (landedAt != null && performance.now() - landedAt > 500) go = false
      if (go && d.length < 3000) requestAnimationFrame(f) }
    const t0 = performance.now(); a.click(); requestAnimationFrame(f)
    while (go && performance.now() - t0 < 40000) await new Promise(r => setTimeout(r, 50))
    return { landed: landedAt != null, ms: landedAt ? Math.round(landedAt - t0) : null, frames: d.length, max: Math.max(...d), top: [...d].sort((x, y) => y - x).slice(0, 5) }
  })()`)
  for (let k = 1; k <= +nFlights; k++) {
    await page.send('Profiler.start')
    const r = await fly('Society', 'plan')
    const { profile } = await page.send('Profiler.stop')
    raw.push(profile)
    out.flights.push({ k, ...r })  // attribution: node spike-analyse.mjs spike-<town>-x<thr>.cpuprofiles.json[.gz]
    await sleep(1500)
    const back = await fly('Home', 'movie')
    out.flights[k - 1].back = back
    await sleep(3000)
  }
} catch (e) { out.error = String(e.message || e) } finally { await chrome.close() }
const { execSync } = await import('node:child_process'); out.load = execSync('sysctl -n vm.loadavg').toString().trim()
writeFileSync(`spike-${town}-x${thr}${process.env.SEED ? '-s' + process.env.SEED : ''}.cpuprofiles.json`, JSON.stringify(raw))
console.log(JSON.stringify(out))

