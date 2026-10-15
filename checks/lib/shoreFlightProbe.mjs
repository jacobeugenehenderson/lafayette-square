// shoreFlightProbe.mjs — A TOWN'S OWN CAMERA PATH ACROSS ITS SHORE, MEASURED FOR claims-the-shore-builds-off-the-frame.mjs (Tern, 2026-10-14/15).
// The CDP plumbing is Meridian's scratch/browse-hang/flight.mjs (the hang probe), taken here so the check depends on nothing in
// scratch/. READ-ONLY: every non-GET request is failed. Cold page → `ward:reveal` → settle → the Society room (the plan), then TWO LEGS:
//   · 'movie' — Esc back to the movie with its clock set just before the span, and the movie played through the span: the
//     flight back into the movie and the path across the shore, as a visitor watches it
//   · 'plan'  — the Society room again, Esc back with the clock set before the span's closest approach, and at that point the tap
//     into the plan: a flight between views that starts beside the shore (Boz, 2026-10-15: the motion rule covers both)
// ⛔ THE CLOCK IS SET BY A PROBE-ONLY HOOK, NOT AN INPUT OF THE PRODUCT. MovieCamera has a real start-phase prop (`start`: seconds
//    or a function of them), and Town passes it through as `movie.start` — but the Ward mounts Town with no `movie`, so a page
//    has no way to reach it, and adding one is a Ward change (Meridian's), not this check's. So the probe intercepts the one
//    place the phase is drawn instead: MovieCamera's 'random' start (Math.random × the cycle, on each ENTRY). Armed, this page's
//    Math.random returns the asked fraction to the call whose stack names MovieCamera.jsx (a dev server's unbundled sources) and
//    to no other. ⛔ If MovieCamera stops drawing it so, the leg THROWS: a leg not placed on the span proves nothing about it.
// Per leg it measures what the check asserts, and nothing else:
//   · frames: every rAF interval of the leg; a frame is LONG when it is longer than TWO frames at rest (one frame dropped) — the
//     rest interval is the median of the 2 s before the leg, the page's own, measured; never a millisecond constant. The same
//     rule as the Ward's checks/society-flight-has-no-long-frame.mjs, so the two agree on any device.
//   · reach: the camera's own (x, z), every frame, against the shore's stations — the nearest it came in the leg, and where it
//     stood at the tap. What the camera did, not what the timeline promised.
//   · programs: three's program list before the leg and after it (a program linked during motion is a long frame)
//   · adopted: near drapes first seen in the leg, and the most stones mounted in it (the near work is what used to stall it)
//   · selfLong: CPU self time inside the long frames, by function (the CPU profile over the leg)
// …and over the whole run:
//   · net: every request from cold load to the end, on the PAGE and on every dedicated WORKER (Target auto-attach): url, from,
//     status, fromDiskCache / fromMemoryCache, bytes on the wire (encodedDataLength) — so a worker re-reading a file the page
//     already holds can be told from a second download
//   · rssPeakMB: the renderer process's peak resident memory over the run (`ps`, sampled; a dedicated worker shares it)
//   · workers: each dedicated worker's script URL (so the revetment's is told from the page's other workers)
//   · revetment: what the shore drew at the end (far meshes, near drape meshes, stones, the primer mounted)
//   · far: when the shore's far layer first drew and was complete, against `ward:reveal` (the far layer is not a reveal class)
// ⚠️ A revalidated response (304) reaches the page as status 200; the WIRE status is read from responseReceivedExtraInfo —
//    joined by requestId across sessions, because Chrome sends a worker's ExtraInfo on another session than its request.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** (x, z) → the plan distance to the nearest station within `reachM`, Infinity beyond it, null for no camera. A cell index
 *  of side reachM, so a minute of frames against thousands of stations is cheap; the check tests it against brute force. */
export function reachIndex(stations, reachM) {
  const grid = new Map(), key = (i, j) => `${i},${j}`
  for (const [x, z] of stations) { const k = key(Math.floor(x / reachM), Math.floor(z / reachM)); (grid.get(k) || grid.set(k, []).get(k)).push([x, z]) }
  return (x, z) => { if (x == null) return null; let best = Infinity; const cx = Math.floor(x / reachM), cz = Math.floor(z / reachM)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [sx, sz] of grid.get(key(cx + i, cz + j)) || []) best = Math.min(best, Math.hypot(sx - x, sz - z))
    return best <= reachM ? best : Infinity }
}

/** @param stations [[x, z], …] the shore's near-lane stations · reachM the near lane's radius (both from revetmentBuild.js)
 *  @param movie { cycleSec, speed, seedSec, endSec } — the clock set at seedSec on entry; recorded until the clock reads endSec
 *  @param plan  { cycleSec, speed, seedSec, tapSec } — the clock set at seedSec on entry; the tap into the plan when it reads tapSec
 *  Clock seconds are MovieCamera's (wall seconds × speed, one cycle = heroCycleSec). */
export async function shoreFlight({ base, town, device = 'desktop', stations, reachM, movie, plan, settleMs = 4000, landMs = 6000, flightMs = 5000 }) {
  if (!stations?.length || !(reachM > 0)) throw new Error('shoreFlight: no shore stations or reach given — nothing to measure the camera against')
  for (const [k, l] of Object.entries({ movie, plan })) if (!(l?.cycleSec > 0 && l.speed > 0 && Number.isFinite(l.seedSec))) throw new Error(`shoreFlight: the ${k} leg has no clock (${JSON.stringify(l)})`)
  const profile = mkdtempSync(join(tmpdir(), 'shore-flight-'))
  const [W, H, DPR] = device === 'phone' ? [390, 844, 3] : [1512, 982, 2]
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' })
  let ws, rssTimer
  const cleanup = () => { clearInterval(rssTimer); try { ws?.close() } catch {}; try { chrome.kill('SIGKILL') } catch {}; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {}; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
  try {
    // ── the renderer's memory, sampled through the whole run ──
    let rssPeakKB = 0
    rssTimer = setInterval(() => { try {
      for (const line of execSync(`ps -axo rss=,command=`, { encoding: 'utf8' }).split('\n'))
        if (line.includes(`user-data-dir=${profile}`) && line.includes('--type=renderer')) rssPeakKB = Math.max(rssPeakKB, parseInt(line, 10) || 0)
    } catch {} }, 250)
    let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
    if (!port) throw new Error('shoreFlight: Chrome never opened its debugging port')
    ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
    await new Promise((r) => { ws.onopen = r })
    let seq = 0; const pending = new Map(), errs = [], net = new Map(), workers = new Map(), wire = new Map()
    const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
    const rq = (sid, id) => { const k = `${sid}:${id}`; return net.get(k) || net.set(k, { from: workers.has(sid) ? 'worker' : 'page', worker: workers.get(sid) ?? null, url: null, status: null, wireStatus: null, fromDiskCache: false, fromMemoryCache: false, bytes: 0 }).get(k) }
    ws.onmessage = (e) => { const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
      const p = m.params || {}, sid = m.sessionId
      if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + String(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text).slice(0, 300))
      if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') errs.push('ERR ' + p.args.map(a => a.value ?? a.description).join(' ').slice(0, 300))
      if (m.method === 'Target.attachedToTarget' && p.targetInfo?.type === 'worker') {
        workers.set(p.sessionId, p.targetInfo.url)
        cdp('Network.enable', {}, p.sessionId).then(() => cdp('Runtime.enable', {}, p.sessionId)).then(() => cdp('Runtime.runIfWaitingForDebugger', {}, p.sessionId)).catch((er) => errs.push('ATTACH ' + er.message))
      }
      if (m.method === 'Network.requestWillBeSent') rq(sid, p.requestId).url = p.request.url
      if (m.method === 'Network.requestServedFromCache') rq(sid, p.requestId).fromMemoryCache = true
      if (m.method === 'Network.responseReceived') { const r = rq(sid, p.requestId); r.status = p.response.status; r.fromDiskCache ||= !!p.response.fromDiskCache; r.fromMemoryCache ||= !!p.response.fromPrefetchCache }
      if (m.method === 'Network.responseReceivedExtraInfo') wire.set(p.requestId, p.statusCode)
      if (m.method === 'Network.loadingFinished') rq(sid, p.requestId).bytes = p.encodedDataLength
    }
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
    const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
    await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S); await cdp('Network.enable', {}, S)
    // ⭐ every dedicated worker the page starts is attached before it runs, so its first request is seen
    await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, S)
    if (device === 'phone') {
      await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true }, S)
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, S)
      await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }, S)
    } else await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false }, S)
    // read-only: a write is failed before it leaves
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, S)
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method !== 'Fetch.requestPaused' || m.sessionId !== S) return
      const r = m.params.request, id = m.params.requestId
      const go = (r.method !== 'GET' && r.method !== 'HEAD' && r.method !== 'OPTIONS') ? cdp('Fetch.failRequest', { requestId: id, errorReason: 'BlockedByClient' }, S) : cdp('Fetch.continueRequest', { requestId: id }, S)
      go.catch((er) => errs.push('FETCH ' + er.message)) })
    const js = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value }
    // from the first frame of the page: the moment a far mesh of the shore first has triangles to draw
    // …and the moment the far layer was COMPLETE (its last face adopted): how long it takes, and what it would add to the reveal
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { let n = 0, g = null, most = 0; const look = () => {
      if (n++ % 10 === 0) { g = g || window.__scene?.getObjectByName?.('revetment') || null
        if (g) { const far = g.children.filter(c => c.isMesh && !c.isInstancedMesh && !c.castShadow && (c.geometry.index?.count ?? 0) > 0).length
          if (far && window.__farFirst == null) window.__farFirst = performance.now()
          if (far > most) { most = far; window.__farLast = performance.now(); window.__farFaces = far } } }
      if (performance.now() < 120000) requestAnimationFrame(look) }; requestAnimationFrame(look) })()` }, S)
    // ⭐ the movie's start phase, armed per leg (see the header)
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const R0 = Math.random
      window.__seedMovie = (r) => { window.__seed = { r, fired: null } }
      Math.random = function () { const s = window.__seed
        if (s && s.fired == null && /MovieCamera\\.jsx/.test(new Error().stack || '')) { s.fired = performance.now(); return s.r }
        return R0() } })()` }, S)
    await cdp('Page.navigate', { url: `${base}/${town}/` }, S)
    let revealed = false
    for (let i = 0; i < 900 && !revealed; i++) { await sleep(100); revealed = await js("performance.getEntriesByName('ward:reveal').length > 0").catch(() => false) }
    if (!revealed) throw new Error(`shoreFlight: no ward:reveal in 90 s (${errs.slice(0, 3).join(' · ') || 'no error said'})`)
    await sleep(settleMs)
    // every linked program: its name, its id, and its whole cache key (the variant: defines, colour space, shadows, …)
    const programs = `(() => { const r = window.__renderer; return r ? (r.info.programs || []).map(p => ({ id: p.id, name: p.name, key: p.cacheKey })) : null })()`
    const click = async (name) => {
      const pt = await js(`(() => { const els = [...document.querySelectorAll('a,button')].filter(e => e.textContent.trim() === '${name}' && e.offsetParent); const b = els[0]?.getBoundingClientRect(); return b ? [b.left + b.width / 2, b.top + b.height / 2] : null })()`)
      if (!pt) throw new Error(`shoreFlight: no visible "${name}" control`)
      if (device === 'phone') { for (const type of ['touchStart', 'touchEnd']) await cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: pt[0], y: pt[1] }] }, S) }
      else for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: pt[0], y: pt[1], button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 }, S)
    }
    // the Ward's own shortcut back (navigation.js: Esc → back): from the Society room to the movie
    const escape = async () => { for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, S) }
    // a resting Leisure's first touch only wakes it (the Ward's README §2): wake it before every tap, as a person would — the
    // movie leg leaves it untouched for a minute, and it rests again (2026-10-15: the plan leg's tap only woke it)
    // ⭐ READ, not assumed: Leisure marks itself `.leisure--resting`, and a resting screen SWALLOWS the touch that wakes it, so a
    // tap at its middle wakes it and does nothing else. On the phone a mouse move does not wake it (2026-10-15: the plan leg's
    // tap only woke the page). Awake, nothing is touched.
    const resting = () => js("!!document.querySelector('.leisure--resting')")
    const wake = async () => {
      if (!(await resting())) return
      if (device === 'phone') { for (const type of ['touchStart', 'touchEnd']) await cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: W / 2, y: H / 3 }] }, S) }
      else await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W / 2, y: H / 3 }, S)
      for (let i = 0; i < 20 && (await resting()); i++) await sleep(100)
      if (await resting()) throw new Error('Leisure is still resting after the touch that should wake it')
      await sleep(400)
    }
    await wake()
    // ONE recorder for the run: every rAF interval with the camera's (x, z) at it; the near counters reset per leg
    await js(`(() => { window.__fr = []; window.__frOn = true; let last = performance.now()
      const N = window.__near = { before: new Set(), seen: new Set(), after: 0, stonesMax: 0, tap: null, g: null, n: 0 }
      window.__legStart = () => { N.before = new Set(); N.seen = new Set(); N.after = 0; N.stonesMax = 0; N.castMax = 0; N.plainMax = 0; N.tap = null; N.n = 0; near(); N.tap = performance.now(); return N.tap }
      // EVERY group named 'revetment' (re-listed every 60 frames: a remount leaves the old one detached, and a second mount would
      // be missed by getObjectByName), and everything under each — drapes, far meshes and stones wherever they hang
      const inScene = (o) => { while (o.parent) o = o.parent; return o === window.__scene }
      const near = () => { if (N.n++ % 60 === 0 && window.__scene) { const gs = []; window.__scene.traverse(o => { if (o.name === 'revetment') gs.push(o) })
          if (N.gs && N.gs.some(g => !inScene(g))) N.lost = (N.lost || 0) + 1
          N.gs = gs; N.groups = Math.max(N.groups || 0, gs.length); N.g = gs[0] || null }
        if (!N.gs?.length) return
        let stones = 0, cast = 0, plain = 0
        for (const g of N.gs) g.traverse((c) => { if (c.isInstancedMesh) stones += c.count; else if (c.isMesh) { if (c.castShadow) cast++; else plain++
          if (!c.castShadow) return; const u = c.geometry.uuid
          if (N.tap == null) N.before.add(u); else if (!N.before.has(u) && !N.seen.has(u)) { N.seen.add(u); N.after++ } } })
        if (N.tap != null) { N.stonesMax = Math.max(N.stonesMax, stones); N.castMax = Math.max(N.castMax || 0, cast); N.plainMax = Math.max(N.plainMax || 0, plain) } }
      const tick = (t) => { if (!window.__frOn) return; const c = window.__camera?.position
        window.__fr.push([Math.round(last), Math.round(t - last), c ? c.x : null, c ? c.z : null]); last = t; near(); requestAnimationFrame(tick) }
      requestAnimationFrame(tick) })()`)
    if (!(await js('!!window.__camera'))) throw new Error('shoreFlight: the page exposes no window.__camera — the camera cannot be measured against the shore')
    const reachOf = reachIndex(stations, reachM)
    // place the movie's clock at `seedSec` on the next entry: arm, Esc back, and wait for MovieCamera to draw it
    const enterAt = async (l, what) => {
      await js(`window.__seedMovie(${(((l.seedSec % l.cycleSec) + l.cycleSec) % l.cycleSec) / l.cycleSec})`)
      await escape()
      let fired = null
      for (let i = 0; i < 100 && fired == null; i++) { await sleep(100); fired = await js('window.__seed.fired') }
      if (fired == null) throw new Error(`shoreFlight: ${what}: Esc did not bring the movie back, or MovieCamera did not draw its start phase from Math.random — the leg cannot be placed on the span`)
      return fired
    }
    const path = () => js('location.pathname + location.search')
    const toPlan = async () => { await wake(); const was = await path(); await click('Society'); await sleep(landMs)
      if ((await path()) === was) throw new Error(`the tap on "Society" did not leave ${was}`) }
    // one leg: frames, reach, programs, adoption, self time — from `t0` (the leg's start) to now
    const measure = async (name, t0, before, prof, tapAt) => {
      const after = await js(programs), adopted = await js('({ drapes: window.__near.after, stonesMax: window.__near.stonesMax, found: !!window.__near.g, regrouped: window.__near.lost || 0, groups: window.__near.groups || 0, castMax: window.__near.castMax || 0, plainMax: window.__near.plainMax || 0 })')
      const all = await js('window.__fr'), rest = all.filter(([t, d]) => t + d <= t0 && t >= t0 - 2000).map(f => f[1]).sort((a, b) => a - b)
      if (rest.length < 10) throw new Error(`shoreFlight: ${name}: only ${rest.length} frame(s) at rest before the leg — no interval to budget against`)
      const interval = rest[rest.length >> 1], budget = 2 * interval
      const frames = all.filter(([t, d]) => t + d > t0)
      // ⛔ NO VERDICT when the page does not keep its display's cadence at rest: the display's interval is the LOWER DECILE of
      // every interval the run saw (one jittered rAF read 8 ms on a 17 ms phone, so never the single shortest); a resting
      // interval over two of those means frames were already being dropped before anything moved (a headless desktop rested at
      // 117 ms, 2026-10-14)
      const sorted = all.map(f => f[1]).filter(d => d > 0).sort((a, b) => a - b), display = sorted[Math.floor(sorted.length / 10)], cadence = interval <= 2 * display
      const reach = frames.map(([, , x, z]) => reachOf(x, z)).filter(r => r != null), nearest = reach.length ? Math.min(...reach) : null
      const tapFrame = tapAt == null ? null : all.find(([t, d]) => t + d >= tapAt), atTap = tapFrame ? reachOf(tapFrame[2], tapFrame[3]) : null
      const nodes = new Map(prof.nodes.map(n => [n.id, n])), longF = frames.filter(([, d]) => d > budget), self = new Map()
      { let t = prof.startTime; prof.samples.forEach((id, i) => { t += prof.timeDeltas[i]; const tp = t0 + (t - prof.startTime) / 1000
        if (!longF.some(([a, d]) => tp >= a && tp <= a + d)) return
        const c = nodes.get(id).callFrame, lab = `${c.functionName || '(anon)'} ${(c.url || '').split('/').pop().split('?')[0]}:${c.lineNumber + 1}`
        self.set(lab, (self.get(lab) || 0) + prof.timeDeltas[i] / 1000) }) }
      const inReach = name === 'plan' ? atTap != null && atTap <= reachM : nearest != null && nearest <= reachM
      const fmt = (m) => m == null ? 'unmeasured' : Number.isFinite(m) ? `${m.toFixed(1)} m` : `beyond ${reachM} m`
      return { name, interval, budget, display, frames: frames.length, ms: frames.length ? Math.round(frames.at(-1)[0] + frames.at(-1)[1] - t0) : 0,
        reach: { nearestM: nearest, atTapM: atTap }, adopted,
        // ⛔ NO VERDICT: a leg that never brought the camera within reach of the shore, or built no near stone while it ran,
        // proves nothing about building it off the frame (Boz, 2026-10-14). Counted DURING the leg, not at its end.
        verdict: cadence && inReach && adopted.drapes > 0 && adopted.stonesMax > 0,
        noVerdict: !cadence ? `the page rested at ${interval} ms against its display's ${display} ms`
          : !inReach ? (name === 'plan' ? `the tap was not within reach of the shore (the camera stood ${fmt(atTap)} from it)` : `the camera never came within reach of the shore (nearest ${fmt(nearest)})`)
          : !(adopted.drapes > 0 && adopted.stonesMax > 0) ? `the leg built no near stone (${adopted.drapes} near drape(s) adopted, at most ${adopted.stonesMax} stone(s) mounted${adopted.found ? '' : '; no shore group found'})` : null,
        longFrames: longF.map(([t, d]) => ({ at: Math.round(t - t0), ms: d })),
        selfLong: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([l, ms]) => `${ms.toFixed(1)} ms ${l}`),
        programs: (() => {
          const had = new Set(before.map(p => p.key)), fresh = after.filter(p => !had.has(p.key))
          // for each program linked in the leg: which fields of its key differ from a same-named program linked before it
          const diff = (p) => { const twin = before.filter(q => q.name === p.name).map(q => { const a = q.key.split(','), b = p.key.split(','); const d = []; for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) d.push(`[${i}] ${String(a[i]).slice(0, 40)} → ${String(b[i]).slice(0, 40)}`); return d }).sort((x, y) => x.length - y.length)[0]
            return twin ? twin.slice(0, 6) : ['no program of this name was linked before the leg'] }
          return { before: before.length, after: after.length, new: fresh.map(p => ({ name: p.name, id: p.id, custom: p.key.split(',').at(-1).slice(0, 60).replace(/\s+/g, ' '), vsBefore: diff(p) })) }
        })() }
    }
    const startProfile = async () => { await cdp('Profiler.enable', {}, S); await cdp('Profiler.setSamplingInterval', { interval: 250 }, S); await cdp('Profiler.start', {}, S) }
    if (!(await js(programs))) throw new Error('shoreFlight: the page exposes no window.__renderer — the program list cannot be read')
    const legs = []
    // ── leg 'movie': from the Society room, Esc back with the clock before the span, played through it ──
    try { await toPlan(); await sleep(2000)
    { const before = await js(programs); await startProfile(); const t0 = await js('window.__legStart()')
      const fired = await enterAt(movie, 'movie leg')
      await sleep(Math.max(0, fired + ((movie.endSec - movie.seedSec) / movie.speed) * 1000 - (await js('performance.now()'))))
      const { profile: prof } = await cdp('Profiler.stop', {}, S)
      legs.push(await measure('movie', t0, before, prof, null)) }
    } catch (e) { legs.push({ name: 'movie', error: e.message }); await cdp('Profiler.stop', {}, S).catch(() => {}) }
    // ── leg 'plan': Esc back with the clock before the span's closest approach; at it, the tap into the plan ──
    try {
      await toPlan()
      const fired = await enterAt(plan, 'plan leg')
      const tapAt = fired + ((plan.tapSec - plan.seedSec) / plan.speed) * 1000
      await sleep(Math.max(0, tapAt - 3000 - (await js('performance.now()'))))
      await wake()                                                 // a second before the rest window opens
      await sleep(Math.max(0, tapAt - (await js('performance.now()'))))
      const before = await js(programs); await startProfile(); const t0 = await js('window.__legStart()'), was = await path()
      await click('Society')
      await sleep(flightMs)
      const { profile: prof } = await cdp('Profiler.stop', {}, S)
      if ((await path()) === was) throw new Error(`the tap on "Society" did not leave ${was}`)
      legs.push(await measure('plan', t0, before, prof, t0))
    } catch (e) { legs.push({ name: 'plan', error: e.message }); await cdp('Profiler.stop', {}, S).catch(() => {}) }
    await js('window.__frOn = false')
    const farAt = await js(`(() => { const r = performance.getEntriesByName('ward:reveal')[0]?.startTime; return r == null ? null : { first: window.__farFirst != null ? Math.round(window.__farFirst - r) : null, complete: window.__farLast != null ? Math.round(window.__farLast - r) : null, faces: window.__farFaces ?? 0 } })()`)
    const revetment = await js(`(() => { const out = { far: 0, near: 0, stones: 0, primer: false, found: false }; window.__scene?.traverse((o) => {
      if (o.name === 'town:revetmentPrimer') out.primer = true
      if (o.name !== 'revetment') return; out.found = true
      for (const c of o.children) { if (c.isInstancedMesh) out.stones += c.count; else if (c.isMesh) (c.castShadow ? out.near++ : out.far++); else if (c.children) for (const b of c.children) if (b.isInstancedMesh && b.count > 1) out.stones += b.count } })
      return out })()`)
    return {
      town, device, legs, revetment, far: farAt,
      net: [...net.entries()].filter(([, r]) => r.url).map(([k, r]) => ({ ...r, wireStatus: wire.get(k.slice(k.indexOf(':') + 1)) ?? null })), workers: [...new Set(workers.values())], rssPeakMB: Math.round(rssPeakKB / 1024), errors: errs.slice(0, 20),
    }
  } finally { cleanup() }
}
