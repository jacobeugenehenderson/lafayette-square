/**
 * read-page.mjs — read one page as a viewer sees it, at noon, dusk and midnight: a screenshot, axe's violations, and
 * for each named target its boxes, computed colours and the contrast measured off the screenshot's own pixels.
 * The DOM half of the Ward's accessibility / contrast checks (the Ward imports it through theward/checks/kit.mjs).
 *
 * ⛔ NO THRESHOLDS here: this reports numbers; the caller's check decides what passes.
 * ⛔ NO DEFAULTS: viewport, place, hours, the clock script and axe's source are all the caller's. A missing one throws.
 * ⛔ NOTHING SKIPPED: a selector matching nothing is `found: 0`; a case whose clock throws or whose page will not
 *    settle carries `{ error }` — and still its screenshot, when one could be taken.
 *
 *   const r = await readPage({
 *     url: 'http://localhost:5180/society',
 *     viewport: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
 *     place: { lat, lon },                         // the town's manifest identity.geography — the caller reads it
 *     at: ['noon', 'dusk', 'midnight'],            // solar noon · civil dusk · solar midnight (nadir), today, at place
 *     clock: (iso) => `import('/src/almanac/almanacClock.js').then(m => m.scrubTo(new Date('${iso}')))`,
 *     targets: [{ name: 'place name', selector: '.place h1', kind: 'text' }],   // kind: 'text' | 'boundary'
 *     axeSource,                                   // the text of axe.min.js — the caller's dependency, not the kit's
 *   })
 *
 * Settling (only http/https requests count as network): after load and after each clock script — two animation frames, then the network idle for IDLE_MS.
 * Pixel contrast (WCAG ratio of relative luminance, from the screenshot at the device pixel ratio):
 *   text      background = the median of the box's own edge pixels; foreground = the pixel farthest from it
 *             (98th percentile of distance, so one stray antialiased pixel cannot decide it)
 *   boundary  foreground = the median of the box's own edge pixels; background = the median of a ring 2 px outside
 */
import SunCalc from 'suncalc'
import { inflateSync } from 'node:zlib'
import { launch, sleep } from './headless.mjs'

const IDLE_MS = 500
const SETTLE_TIMEOUT_MS = 60000
const HOURS = { noon: 'solarNoon', dusk: 'dusk', midnight: 'nadir' }

export async function readPage({ url, viewport, place, at, clock, targets, axeSource }) {
  for (const [k, v] of Object.entries({ url, viewport, place, at, clock, targets, axeSource }))
    if (v == null) throw new Error(`readPage: ${k} is required`)
  for (const k of ['width', 'height', 'deviceScaleFactor', 'mobile'])
    if (viewport[k] == null) throw new Error(`readPage: viewport.${k} is required`)
  for (const h of at) if (!HOURS[h]) throw new Error(`readPage: unknown hour "${h}" (${Object.keys(HOURS).join(', ')})`)
  for (const t of targets) if (!['text', 'boundary'].includes(t.kind)) throw new Error(`readPage: target "${t.name}" kind must be text or boundary`)

  const chrome = await launch()
  try {
    const page = await chrome.openPage()
    const inflight = new Set()
    let lastNet = Date.now()
    const net = (fn) => (p) => { fn(p); lastNet = Date.now() }
    // Only the network counts: blob:/data: loads (worker scripts built in memory) never report finishing.
    page.on('Network.requestWillBeSent', net((p) => { if (/^https?:/.test(p.request.url)) inflight.add(p.requestId) }))
    page.on('Network.loadingFinished', net((p) => inflight.delete(p.requestId)))
    page.on('Network.loadingFailed', net((p) => inflight.delete(p.requestId)))
    await page.send('Network.enable')
    await page.send('Page.enable')
    await page.send('Emulation.setDeviceMetricsOverride', viewport)
    if (viewport.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true })

    const evaluate = async (expression) => {
      const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    }
    const settle = async () => {
      await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))')
      const t0 = Date.now()
      while (inflight.size || Date.now() - lastNet < IDLE_MS) {
        if (Date.now() - t0 > SETTLE_TIMEOUT_MS) throw new Error(`page did not settle in ${SETTLE_TIMEOUT_MS / 1000} s (${inflight.size} requests in flight)`)
        await sleep(100)
      }
    }

    const loaded = new Promise((r) => page.on('Page.loadEventFired', r))
    await page.send('Page.navigate', { url })
    await loaded
    let unloaded = null
    try { await settle() } catch (e) { unloaded = `on load: ${e.message}` }
    const renderer = await evaluate(`(() => { const gl = document.createElement('canvas').getContext('webgl');
      const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null })()`)
    if (!unloaded) await evaluate(axeSource + '\n;true')

    const times = SunCalc.getTimes(new Date(), place.lat, place.lon)
    const cases = []
    for (const h of at) {
      const time = times[HOURS[h]]
      const c = { at: h, time: Number.isNaN(time?.getTime()) ? null : time.toISOString() }
      try {
        if (unloaded) throw new Error(unloaded)
        if (!c.time) throw new Error(`no ${h} at ${place.lat}, ${place.lon} today (polar day or night)`)
        await evaluate(clock(c.time))
        await settle()
      } catch (e) { c.error = e.message }
      let png = null
      try {
        png = Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')
        c.screenshot = png.toString('base64')
      } catch (e) { c.error = c.error || `screenshot: ${e.message}` }
      if (!c.error) {
        try {
          const v = await evaluate(`axe.run(document).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help,
            nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) })))`)
          c.axe = { violations: v }
        } catch (e) { c.axe = { error: e.message } }
        const image = decodePng(png)
        const dom = await evaluate(`(${readTargets})(${JSON.stringify(targets)})`)
        c.targets = dom.map((t, i) => ({
          ...t,
          elements: t.elements.map((el) => ({ ...el, pixel: measure(image, el.box, viewport.deviceScaleFactor, targets[i].kind) })),
        }))
      }
      cases.push(c)
    }
    await page.close()
    return { url, viewport, renderer, cases }
  } finally {
    await chrome.close()
  }
}

// In the page: every match of every target — its box, text, colours, and the background it sits on when that is a
// flat colour. `backgroundResolved: null` = an image, a gradient, a translucent layer or nothing (the canvas shows
// through) is behind it; then only the pixels can say.
function readTargets(targets) {
  const opaque = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return p.length < 4 || p[3] === 1 }
  const clear = (c) => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)
  const behind = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.backgroundImage !== 'none') return null
      if (clear(s.backgroundColor)) continue
      return opaque(s.backgroundColor) ? s.backgroundColor : null
    }
    return null
  }
  return targets.map((t) => {
    const els = [...document.querySelectorAll(t.selector)]
    return {
      name: t.name, selector: t.selector, found: els.length,
      elements: els.map((el) => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el)
        return {
          box: { x: r.x, y: r.y, width: r.width, height: r.height },
          ...(t.kind === 'text' ? { text: el.innerText.trim().slice(0, 200) } : {}),
          color: t.kind === 'text' ? s.color : s.borderTopColor,
          backgroundResolved: behind(t.kind === 'text' ? el : el.parentElement),
        }
      }),
    }
  })
}

// ── contrast off the screenshot ─────────────────────────────────────────────────────────────────────────────
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2])
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] }
const r3 = (x) => Math.round(x * 1000) / 1000

function measure(img, box, dpr, kind) {
  const x0 = Math.round(box.x * dpr), y0 = Math.round(box.y * dpr)
  const x1 = Math.round((box.x + box.width) * dpr) - 1, y1 = Math.round((box.y + box.height) * dpr) - 1
  if (x1 - x0 < 2 || y1 - y0 < 2) return { error: 'box too small to measure' }
  if (x0 < 0 || y0 < 0 || x1 >= img.width || y1 >= img.height) return { error: 'box not wholly on screen' }
  const at = (x, y) => lum(img.data, (y * img.width + x) * 4)
  const ring = (xa, ya, xb, yb) => {
    const out = []
    for (let x = xa; x <= xb; x++) { if (ya >= 0 && ya < img.height && x >= 0 && x < img.width) out.push(at(x, ya)); if (yb >= 0 && yb < img.height && x >= 0 && x < img.width) out.push(at(x, yb)) }
    for (let y = ya + 1; y < yb; y++) { if (xa >= 0 && xa < img.width && y >= 0 && y < img.height) out.push(at(xa, y)); if (xb >= 0 && xb < img.width && y >= 0 && y < img.height) out.push(at(xb, y)) }
    return out
  }
  let fg, bg
  if (kind === 'text') {
    bg = median(ring(x0, y0, x1, y1))
    const d = []
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) { const l = at(x, y); d.push([Math.abs(l - bg), l]) }
    d.sort((a, b) => a[0] - b[0])
    fg = d[Math.floor((d.length - 1) * 0.98)][1]
  } else {
    fg = median(ring(x0, y0, x1, y1))
    const o = Math.round(2 * dpr)
    const outside = ring(x0 - o, y0 - o, x1 + o, y1 + o)
    if (!outside.length) return { error: 'no pixels outside the box' }
    bg = median(outside)
  }
  return { foregroundLum: r3(fg), backgroundLum: r3(bg), contrast: Math.round(ratio(fg, bg) * 100) / 100 }
}

// PNG → RGBA (8-bit RGB/RGBA, non-interlaced: what Page.captureScreenshot writes). Anything else throws.
function decodePng(buf) {
  let p = 8, width, height, depth, type, interlace
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len)
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12] }
    else if (kind === 'IDAT') idat.push(body)
    else if (kind === 'IEND') break
    p += 12 + len
  }
  const bpp = { 2: 3, 6: 4 }[type]
  if (depth !== 8 || !bpp || interlace) throw new Error(`screenshot PNG not 8-bit RGB/RGBA non-interlaced (depth ${depth}, type ${type})`)
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp
  const out = new Uint8Array(width * height * 4), prev = new Uint8Array(stride), cur = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0
      let v = row[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[i] = v & 255
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, s = x * bpp
      out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = bpp === 4 ? cur[s + 3] : 255
    }
    prev.set(cur)
  }
  return { width, height, data: out }
}
