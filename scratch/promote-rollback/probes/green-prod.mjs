// green-prod.mjs — green.mjs against a town's own domain (no /<map> prefix). Edit the domain inside before use. node green-prod.mjs <outDir> <map> desk|phone
import { writeFileSync } from 'node:fs'
const [,, OUT, town, mode] = process.argv
const phone = mode === 'phone', W = phone ? 390 : 1440, H = phone ? 844 : 900
const { launch, sleep } = await import('/Users/jacobhenderson/Desktop/lafayette-square.nosync/scripts/lib/headless.mjs')
const chrome = await launch({ windowSize: `${W},${H}` })
const ok = [], bad = []
const A = (cond, what) => (cond ? ok : bad).push(what)
try {
  const page = await chrome.openPage()
  await page.send('Page.enable'); await page.send('Runtime.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: phone })
  if (phone) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  page.on('Fetch.requestPaused', ({ requestId, request }) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) page.send('Fetch.continueRequest', { requestId }).catch(() => {})
    else page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {})
  })
  const ev = async (x) => { const r = await page.send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'ERR ' + (r.exceptionDetails.exception?.description || '').slice(0, 150) : r.result?.value }
  const shot = async (n) => { const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); writeFileSync(`${OUT}/${town}-${mode}-${n}.jpg`, Buffer.from(data, 'base64')) }
  const here = () => ev(`location.pathname || '/'`)
  const tower = () => ev(`(() => { const b = document.querySelector('.map-tower'); return b ? b.getAttribute('aria-label') : null })()`)
  const rose = () => ev(`!!document.querySelector('.map-rose')`)
  const band = (name) => ev(`(() => { const b = [...document.querySelectorAll('.band a, .band button')].find(e => e.textContent.trim() === ${JSON.stringify(name)}); b?.click(); return !!b })()`)
  const waitFor = async (expr, s) => { for (let i = 0; i < s * 4; i++) { if (await ev(expr)) return true; await sleep(250) } return false }
  await page.send('Page.navigate', { url: `https://hipointedemun.online/` })
  await waitFor("performance.getEntriesByName('ward:reveal').length > 0", 60)
  A((await ev("document.querySelector('meta[name=ward-build]')?.content"))?.startsWith('382f1bd'), 'build is 382f1bd')
  await sleep(2000)
  // ① Society: bulb under the rose; tap → on
  await band('Society'); await sleep(5000)
  A(await rose(), '① Society has the rose')
  const t0 = await tower(); A(t0 && /off/.test(t0), `① Society has the bulb, off (${t0})`)
  const geo = await ev(`(() => { const r = document.querySelector('.map-rose')?.getBoundingClientRect(), b = document.querySelector('.map-tower')?.getBoundingClientRect(); return r && b ? { under: b.top >= r.bottom - 1 && Math.abs(b.left - r.left) < 2, same: Math.abs(b.width - r.width) < 2 } : null })()`)
  A(geo?.under && geo?.same, `① the bulb is the rose's size, directly under it (${JSON.stringify(geo)})`)
  await ev(`document.querySelector('.map-tower').click()`)
  const lit = await waitFor(`/: on\\./.test(document.querySelector('.map-tower')?.getAttribute('aria-label') || '')`, 45)
  A(lit, `① a tap turns it on (${await tower()})`)
  await shot('1-society-lit')
  // ③ a card opened from a lit Society, then Back, keeps it lit
  const opened = await ev(`(async () => { const chips = [...document.querySelectorAll('.categories .chip:not(.chip--crumb)')]; for (const c of chips) { c.click(); await new Promise(r => setTimeout(r, 1200)); const o = document.querySelector('.place-row__open'); if (o) { o.click(); return c.textContent.trim() } } return null })()`)
  await sleep(3500)
  A(opened && (await here()).startsWith('/place/'), `③ a row's › opens a card (${opened} → ${await here()})`)
  const dist = await ev(`/\\bdistricts?\\b/i.test(document.body.innerText)`)
  A(dist === false, '◇ the card says no "district"')
  await shot('2-card')
  await ev('history.back()'); await sleep(3500)
  A((await here()) === '/society', `③ Back returns to /society (${await here()})`)
  A(/: on\./.test((await tower()) || ''), `③ the light is still on after the card (${await tower()})`)
  // ② Home → drag → /map: no bulb, no rose, the credit
  await band('Home'); await sleep(3500)
  const x = W / 2, y = H * 0.4
  if (phone) { await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); for (let i = 1; i <= 12; i++) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 160 * i / 12 }] }); await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
  else { await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); for (let i = 1; i <= 12; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y + 160 * i / 12, button: 'left', buttons: 1 }); await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: y + 160, button: 'left', buttons: 0, clickCount: 1 }) }
  await sleep(4000)
  A((await here()) === '/map', `② the downward drag opens /map (${await here()})`)
  A((await tower()) === null, '② /map has no bulb')
  A((await rose()) === false, '② /map has no rose')
  A(await ev(`!!document.querySelector('.credits--map')`), '② /map keeps the credit')
  await shot('3-map')
  // ② the light was put out on leaving Society: back in Society it reads off
  await band('Society'); await sleep(5000)
  A(/off/.test((await tower()) || ''), `② leaving Society put the light out (back in Society: ${await tower()})`)
} catch (e) { bad.push('threw: ' + e.message) } finally { await chrome.close() }
console.log(`${town} ${mode}: ${bad.length ? 'RED' : 'GREEN'}  (${ok.length} ok, ${bad.length} failed)`); for (const b of bad) console.log('  ✗ ' + b); for (const o of ok) console.log('  ✓ ' + o)
process.exit(0)
