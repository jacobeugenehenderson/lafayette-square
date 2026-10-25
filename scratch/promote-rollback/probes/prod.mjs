// prod.mjs — the visitor probe: reveal time, bytes, drag → /map, Society, 4xx and console errors. node prod.mjs <outDir> <url> <tag> desk|phone
import { writeFileSync } from 'node:fs'
const [,, OUT, url, tag, mode] = process.argv
const phone = mode === 'phone'
const W = phone ? 390 : 1440, H = phone ? 844 : 900
const { launch, sleep } = await import('/Users/jacobhenderson/Desktop/lafayette-square.nosync/scripts/lib/headless.mjs')
const chrome = await launch({ windowSize: `${W},${H}` })
const log = [], errs = new Set()
let bytes = 0, reqs = 0, failed = []
try {
  const page = await chrome.openPage()
  await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable')
  await page.send('Network.setCacheDisabled', { cacheDisabled: true })
  page.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; reqs++ })
  page.on('Network.loadingFailed', e => { if (!e.canceled) failed.push(e.errorText) })
  page.on('Network.responseReceived', e => { if (e.response.status >= 400) failed.push(e.response.status + ' ' + e.response.url.slice(0, 120)) })
  page.on('Runtime.consoleAPICalled', e => { if (e.type === 'error') errs.add(e.args.map(a => a.value ?? a.description).join(' ').slice(0, 160)) })
  page.on('Runtime.exceptionThrown', e => errs.add('EXC ' + (e.exceptionDetails.exception?.description || e.exceptionDetails.text).slice(0, 200)))
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: phone ? 2 : 1, mobile: phone })
  if (phone) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  page.on('Fetch.requestPaused', ({ requestId, request }) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) page.send('Fetch.continueRequest', { requestId }).catch(() => {})
    else page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {})
  })
  const ev = async (x) => { const r = await page.send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? null : r.result?.value }
  const shot = async (n) => { const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); writeFileSync(`${OUT}/${tag}-${mode}-${n}.jpg`, Buffer.from(data, 'base64')) }
  const t0 = Date.now()
  await page.send('Page.navigate', { url })
  let rev = null
  for (let i = 0; i < 300; i++) { await sleep(200); if (await ev("performance.getEntriesByName('ward:reveal').length > 0")) { rev = Date.now() - t0; break } if (!(await ev("!!document.querySelector('meta[name=ward-build]')")) && i > 150) break }
  log.push(`reveal: ${rev ?? 'none'} ms  build: ${await ev("document.querySelector('meta[name=ward-build]')?.content || 'no ward-build'")}  title: ${await ev('document.title')}`)
  await sleep(3000); await shot('1')
  const cam = () => ev("JSON.stringify(window.__wardMap?.camera?.position ?? null)")
  const c1 = await cam(); await sleep(5000); await shot('2'); const c2 = await cam()
  log.push(`camera moved over 5 s: ${c1 && c2 ? c1 !== c2 : 'n/a'}  (${c1} → ${c2})`)
  log.push(`after ~${Math.round((Date.now()-t0)/1000)} s: ${reqs} requests, ${(bytes/1e6).toFixed(1)} MB transferred`)
  if (await ev("!!document.querySelector('meta[name=ward-build]')")) {
    const x = W / 2, y = H * 0.4
    if (phone) { await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); for (let i = 1; i <= 12; i++) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 160 * i / 12 }] }); await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
    else { await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); for (let i = 1; i <= 12; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y + 160 * i / 12, button: 'left', buttons: 1 }); await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: y + 160, button: 'left', buttons: 0, clickCount: 1 }) }
    await sleep(4000); log.push(`after drag: ${await ev('location.pathname')}`); await shot('3-drag')
    await ev(`(() => { const b = [...document.querySelectorAll('.band a, .band button')].find(e => e.textContent.trim() === 'Society'); b?.click(); return !!b })()`)
    await sleep(6000); log.push(`society: ${await ev('location.pathname')}`); await shot('4-society')
  }
  log.push(`final: ${reqs} requests, ${(bytes/1e6).toFixed(1)} MB; failed/4xx: ${failed.length} ${[...new Set(failed)].slice(0, 6).join(' | ')}`)
} catch (e) { log.push('threw: ' + e.message) } finally { await chrome.close() }
log.push('console errors (' + errs.size + '):'); for (const e of [...errs].slice(0, 25)) log.push('  ' + e)
console.log(log.join('\n')); process.exit(0)
