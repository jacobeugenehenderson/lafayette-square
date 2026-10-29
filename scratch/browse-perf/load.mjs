// A town's cold load, read-only. Each run uses a fresh headless Chrome profile (cold cache) on the given URL, with
// probe.mjs's CDP scaffold. It records: the splash ([data-town-splash] first in the DOM), the kit's startup marks
// (ward:*), bytes and requests by phase (Network, encodedDataLength at loadingFinished), the 10 largest files, and
// long tasks over --long ms (PerformanceObserver 'longtask'; the browser gives attribution only, never function names).
// Usage: node scratch/browse-perf/load.mjs --url=https://provincetown.online/ [--runs=3] [--window=1512x982 --dpr=2] [--long=200]
//   [--profile]: a CPU profile over navigation → reveal; each long task's top self-time functions
//   [--grep=<regex>]: also list every request whose URL matches, with its bytes and times
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const URL_ = arg('url'), RUNS = +arg('runs', '3'), LONG = +arg('long', '200'), TIMEOUT = +arg('timeout', '180000')
const [W, H] = arg('window', '1512x982').split('x').map(Number), DPR = +arg('dpr', '2')
if (!URL_) { console.error('--url is required'); process.exit(2) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const INIT = `(() => {
  window.__probe = { splash: null, long: [] }
  new MutationObserver((_, o) => { if (document.querySelector('[data-town-splash]')) { window.__probe.splash = performance.now(); o.disconnect() } })
    .observe(document, { childList: true, subtree: true })
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > ${LONG}) window.__probe.long.push({ start: Math.round(e.startTime), ms: Math.round(e.duration), name: e.name, attr: (e.attribution || []).map(a => [a.containerType, a.containerSrc, a.containerName].filter(Boolean).join(' ')).join('; ') }) }).observe({ type: 'longtask', buffered: true }) } catch {}
})()`

async function once(run) {
  const profile = mkdtempSync(join(tmpdir(), 'load-probe-'))
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', `--window-size=${W},${H}`, `--force-device-scale-factor=${DPR}`, 'about:blank'], { stdio: 'ignore' })
  const cleanup = () => { try { chrome.kill('SIGKILL') } catch {}; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {}; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
  try {
    let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
    const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
    await new Promise((r) => { ws.onopen = r })
    let seq = 0; const pending = new Map(), events = []
    const cdp = (method, params = {}, sid) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) } else if (m.method) events.push(m) }
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
    const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
    await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S); await cdp('Network.enable', {}, S)
    await cdp('Network.setCacheDisabled', { cacheDisabled: true }, S)
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: INIT }, S)
    const js = async (x) => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, S); return r?.result?.value }
    const PROFILE = process.argv.includes('--profile')
    if (PROFILE) { await cdp('Profiler.enable', {}, S); await cdp('Profiler.setSamplingInterval', { interval: 500 }, S); await cdp('Profiler.start', {}, S) }
    const t0 = Date.now()
    await cdp('Page.navigate', { url: URL_ + (URL_.includes('?') ? '&' : '?') + 'cold=' + t0 }, S)
    let done = false
    while (!done && Date.now() - t0 < TIMEOUT) { await sleep(250); done = await js("performance.getEntriesByName('ward:first-truthful-frame').length > 0 || performance.getEntriesByType('mark').some(m => m.name.startsWith('ward:failed:'))") }
    await sleep(3000)   // trailing requests and long tasks after the reveal
    const prof = PROFILE ? (await cdp('Profiler.stop', {}, S)).profile : null
    const page = await js(`(() => ({ origin: performance.timeOrigin, splash: window.__probe.splash, long: window.__probe.long,
      marks: performance.getEntriesByType('mark').filter(m => m.name.startsWith('ward:')).map(m => [m.name, Math.round(m.startTime)]),
      fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1),
      gpu: (() => { try { const c = document.createElement('canvas').getContext('webgl2'); const d = c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?' } catch { return 'none' } })() }))()`)
    // Network: requestWillBeSent (url, wallTime) → loadingFinished (bytes) / loadingFailed.
    const req = new Map(); let wall0 = null, ts0 = null
    for (const e of events) {
      const p = e.params
      if (e.method === 'Network.requestWillBeSent') { if (wall0 == null) { wall0 = p.wallTime; ts0 = p.timestamp } req.set(p.requestId, { url: p.request.url, start: p.timestamp }) }
      if (e.method === 'Network.responseReceived' && req.has(p.requestId)) req.get(p.requestId).status = p.response.status
      if (e.method === 'Network.loadingFinished' && req.has(p.requestId)) Object.assign(req.get(p.requestId), { end: p.timestamp, bytes: p.encodedDataLength })
      if (e.method === 'Network.loadingFailed' && req.has(p.requestId)) Object.assign(req.get(p.requestId), { end: p.timestamp, failed: p.errorText })
    }
    // wallTime is epoch seconds; page times are ms from timeOrigin. Request start/end in page ms:
    const off = wall0 * 1000 - page.origin
    const rows = [...req.values()].map(r => ({ ...r, s: Math.round((r.start - ts0) * 1000 + off), e: r.end ? Math.round((r.end - ts0) * 1000 + off) : null }))
    // --profile: the main thread's JS self time inside each long task, by function + script:line (minified names as
    // served; workers are not in this profile). Profile times are the same monotonic clock as Network's, in µs.
    let tasks
    if (prof) {
      const node = new Map(prof.nodes.map(n => [n.id, n])), parent = new Map()
      for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id)
      const at = []; let t = prof.startTime
      for (let i = 0; i < prof.samples.length; i++) { t += prof.timeDeltas[i]; at.push([((t / 1e6) - ts0) * 1000 + off, prof.samples[i], (prof.timeDeltas[i + 1] ?? 0) / 1000]) }
      tasks = page.long.map(L => {
        const by = new Map(), inc = new Map()
        for (const [ms, id, dur] of at) if (ms >= L.start && ms < L.start + L.ms) {
          const seen = new Set()
          for (let c = id; c != null; c = parent.get(c)) { const f = node.get(c).callFrame; if (!f.url) continue; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}:${f.columnNumber + 1}`; if (!seen.has(k)) { seen.add(k); inc.set(k, (inc.get(k) || 0) + dur) } }
          const f = node.get(id).callFrame, k = `${f.functionName || '(anon)'} ${f.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] || '(' + (f.functionName || 'native') + ')'}:${f.lineNumber + 1}:${f.columnNumber + 1}`
          by.set(k, (by.get(k) || 0) + dur)
        }
        return { start: L.start, ms: L.ms, top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [Math.round(v), k]),
          inclusive: [...inc].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [Math.round(v), k]) }
      })
    }
    const mark = Object.fromEntries(page.marks)
    const reveal = mark['ward:reveal'], first = mark['ward:first-truthful-frame']
    const cuts = [['to splash', page.splash], ['splash → reveal', reveal], ['reveal → +3 s', Infinity]]
    let prev = -Infinity
    const phases = cuts.map(([name, at]) => { const inP = rows.filter(r => r.e != null && r.e > prev && r.e <= (at ?? Infinity)); prev = at ?? prev; return { name, n: inP.length, mb: +(inP.reduce((a, r) => a + (r.bytes || 0), 0) / 1e6).toFixed(2) } })
    const big = rows.filter(r => r.bytes).sort((a, b) => b.bytes - a.bytes).slice(0, 10)
      .map(r => ({ mb: +(r.bytes / 1e6).toFixed(2), s: r.s, ms: r.e - r.s, file: r.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] }))
    return { run, gpu: page.gpu, fcp: page.fcp, splash: page.splash == null ? null : Math.round(page.splash), firstFrame: first ?? null, reveal: reveal ?? null,
      marks: page.marks, failed: page.marks.filter(([n]) => n.startsWith('ward:failed:')), timedOut: !done,
      total: { n: rows.length, mb: +(rows.reduce((a, r) => a + (r.bytes || 0), 0) / 1e6).toFixed(2), failedReq: rows.filter(r => r.failed).length },
      phases, big, long: page.long, tasks,
      grep: arg('grep') ? rows.filter(r => new RegExp(arg('grep')).test(r.url)).map(r => ({ file: r.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0], mb: +((r.bytes || 0) / 1e6).toFixed(3), s: r.s, ms: r.e - r.s })) : undefined }
  } finally { cleanup() }
}

for (let i = 1; i <= RUNS; i++) console.log(JSON.stringify(await once(i)))
process.exit(0)
