#!/usr/bin/env node
/**
 * "DOES A SHOT CHANGE FLY — ON THE OLD PLAYER'S CLOCK AND CURVE — AND LAND WHERE THE SHOT IS?"
 *
 * WHY (BRIEF-town-shot-flight §3; Jacob, 2026-09-28: "it should do the same camera transition it used to"). The
 * reference is production's move (Scene.jsx CameraRig): transitions.js durations keyed by the shot entered, the
 * position lerped on easeInOutCubic, a true overhead on landing in plan, a chase into the MOVING movie pose.
 *
 * RUNTIME: headless Chrome, a throwaway profile, against the running dev server; Preview (it draws through <Town>),
 * the town from --town (default huron). It samples the REAL camera every animation frame (window.__camera, exposed by
 * Town's ShaderLinkGuard) and the app's flight ref (Preview exposes it as window.__flight). No input is sent but the
 * Preview's own shot buttons and one wheel event.
 *
 * Asserts:
 *   1. movie → plan flies: moves on most frames it draws (≥ 8, ≥ half — a cut is one); on the WALL clock it runs
 *      transitions.js' plan entry (2400 ms) ± 1% (the slope of the flight's t against `at`, its frame's performance.now()); the camera's
 *      position is linear in easeInOutCubic(t) to 2% of the move; the ref's `eased` is that same curve; it lands in a
 *      true overhead (camera directly above its target).
 *   2. plan → movie hands off onto the MOVING path with no jump (handoff(), below): the step into the landing is at
 *      most the tween's remaining fraction of its own move plus one frame of the movie's travel; the two frames after it
 *      run within the movie's own measured speed band; and the camera keeps moving. Every bound is this run's own.
 *   3. a wheel mid-flight ends it where it is: the ref reports interrupted with t < 1.
 *   4. viewInset (Preview's ?inset=): the movie is full frame (no view offset); the plan lands with its target at the
 *      centre of the FREE region (± 3 px); mid-flight the offset has moved by the flight's own eased fraction.
 *   5. the plan's one move and the rose (Preview's window.__townProbe): lighting places (litIds, as typing does) does
 *      NOT move the camera; a frameKey change flies plan → plan on transitions.js' `frame` (1200 ms ± 1%) and onFramed
 *      discloses { placed, of }; planHeading 'north' turns the map to bearing 0 and 'town' back to the town's
 *      browseHeading (± 1°), read through bearingRef; { follow: headingRef } turns screen-up to the reader's true
 *      heading and follows a change within 2 frames (no flight), holding north up while the heading is null; under prefers-reduced-motion a shot change is a cut (no frame
 *      with 0 < t < 1). (Pausing is its own check: claims-a-paused-town-draws-nothing.)
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-a-shot-change-flies.mjs --town=<town> [--base=http://localhost:5173] [--dump=<file>]
 *   --replay=<dump> [-v]: §2 and its three mutants on a saved --dump, no browser (stale landing · clock jump · tween cut short).
 *   --code-mutant=chase: the browser run with ShotFlight served without its chase (the response rewritten in flight, never on
 *   disk); passes only if §2 goes red.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SHOT_TRANSITION_MS } from '../src/camera/transitions.js'
import { requiredTown } from './_scenes.mjs'

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * §2, THE HAND-OFF: does plan → movie land on the MOVING path with no jump? On one recording of the flight ({ out, p0 }:
 * every frame, and the camera at the click, which is the tween's `from`, since the plan holds still until the tween
 * starts). → { fails, line } | { refused }.
 * ⛔ Every bound comes from this run: the tween's own remaining move and the movie's own measured speeds. It replaced
 * `max(speed(iL−1..iL+1)) ≤ 4 × the movie's median` (2026-11-01), a constant that was right for one town and one frame
 * rate: speed(iL−1) is the eased tween's last coarse frame, so the ratio passed or failed by the move's length and the
 * frame interval (PTown 70 m/s, Huron 30 m/s, against a movie at 4.2 m/s, with a clean hand-off in both).
 * The movie's clock RUNS during the flight (MovieCamera's useFrame advances it before `hold` stops the writes), so the
 * chase follows a moving target, and a landing without it is stale by the movie's travel over the flight.
 */
function handoff({ out: s, p0 }) {
  const iL = s.findIndex((x) => x.landed && x.to === 'movie')
  if (iL < 0) return { fails: ['plan → movie: the flight never landed (to=movie)'] }
  if (!Array.isArray(p0)) return { refused: 'the recording carries no p0 (the camera at the click): the move\'s length cannot be bounded' }
  const prev = s[iL - 1]
  if (!prev || prev.landed || prev.e == null || prev.to !== 'movie') return { fails: ['plan → movie: no flight frame before the landing — a cut, not a flight'] }
  // (b)'s speeds are per rAF TIMESTAMP (`ts`), the clock the movie steps by (MovieCamera#presentedClock, via r3f's addEffect);
  // `ms`, performance.now() inside the recorder's callback, is a second clock that wanders by milliseconds, which on a
  // movie that accelerates read as a speed band wide enough to hide a skipped frame (HPDM, 2026-11-01: 4.8–14.8 m/s).
  if (s.slice(iL).some((x) => !Number.isFinite(x.ts))) return { refused: 'the recording carries no rAF timestamps (ts): the movie\'s speed cannot be read on its own clock' }
  const speed = (k) => dist(s[k].p, s[k - 1].p) / Math.max(1e-3, s[k].ts - s[k - 1].ts)   // m per ms of the movie's clock
  // The movie's own speeds, past the hand-off frames. ⛔ Fewer than 5 is a recording too short to measure, not a pass.
  const win = []
  for (let k = iL + 3; k < s.length; k++) win.push(speed(k))
  if (win.length < 5) return { refused: `only ${win.length} movie frames after the hand-off (need 5)` }
  const vMax = Math.max(...win), vMin = Math.min(...win)
  // THE TIMESTAMP'S GRAIN, measured: the coarsest decimal step every recorded ts sits on (Chrome coarsens rAF time). A
  // speed over one frame is then known to ± 2·grain/dt of itself: 0.1% on a 100 ms frame at a 0.1 ms grain, which is
  // the size of a constant-speed movie's whole measured band (Huron, 2026-11-01: 4.125 against a window max of 4.120).
  const grain = [1, 0.1, 0.01, 0.001, 1e-4].find((g) => s.every((x) => Math.abs(x.ts / g - Math.round(x.ts / g)) < 1e-3)) ?? 0
  // ACCELERATION, measured: the largest change of the movie's speed from one frame to the next inside the window. A frame
  // n frames before the window may run n of those faster than anything the window saw (a movie speeding up at the landing).
  let dvMax = 0
  for (let k = iL + 4; k < s.length; k++) dvMax = Math.max(dvMax, Math.abs(speed(k) - speed(k - 1)))
  // The movie's speed bound on frame k: its window's top, its band, the grain's error on that frame, and the acceleration
  // over the frames between k and the window's start (3 for the landing, 2 and 1 for the hand-off frames).
  const bound = (k) => vMax + (vMax - vMin) + vMax * 2 * grain / Math.max(1e-3, s[k].ts - s[k - 1].ts) + dvMax * (iL + 3 - k)
  const fails = []
  // (a) THE STEP INTO THE LANDING: at most the tween's remaining fraction of its own move, plus the movie's travel in
  // that frame. The move is bounded above by |landing − p0| plus the movie's travel over the flight (the chase's drift).
  const T = s[iL].ms
  const L = dist(s[iL].p, p0) + vMax * T
  // The movie's travel in that frame is on the movie's clock (ts); `ms` here gave a false red (PTown, 2026-11-01: 0.578 m
  // against 0.550 by ms, 0.580 by ts).
  const into = dist(s[iL].p, prev.p), dtL = s[iL].ts - prev.ts
  const allowed = (1 - prev.e) * L + bound(iL) * dtL
  if (into > allowed) fails.push(`plan → movie: the step into the landing is ${into.toFixed(2)} m — the tween had ${((1 - prev.e) * L).toFixed(2)} m left and the movie travels ${(vMax * dtL).toFixed(2)} m in that frame (≤ ${allowed.toFixed(2)} m)`)
  // (b) THE FIRST MOVIE FRAMES: within the movie's own measured speed band (its jitter, rAF time against presented time).
  const hand = [speed(iL + 1), speed(iL + 2)]
  hand.forEach((v, j) => { const b = bound(iL + 1 + j); if (v > b) fails.push(`plan → movie: ${(v * 1000).toFixed(3)} m/s on the frame ${j + 1} after the landing — the movie runs ${(vMin * 1000).toFixed(3)}–${(vMax * 1000).toFixed(3)} m/s (≤ ${(b * 1000).toFixed(3)} with the ${grain} ms grain): the hand-off jumped`) })
  if (dist(s[s.length - 1].p, s[iL].p) < 1e-3) fails.push('plan → movie: the camera stopped after landing — it landed on a still pose, not the moving path')
  // RESOLUTION: the smallest clock skip (b) can see on this run, at the first movie frame.
  const vMed = [...win].sort((a, b) => a - b)[win.length >> 1]
  const dtsW = s.slice(iL + 1).map((x, k) => x.ts - s[iL + k].ts).sort((a, b) => a - b), dtMed = dtsW[dtsW.length >> 1]
  const skipSec = Math.max(0, (bound(iL + 1) - hand[0]) * (s[iL + 1].ts - s[iL].ts)) / vMed / 1000
  const line = `plan → movie: landed at ${s[iL].ms.toFixed(0)} ms · into the landing ${into.toFixed(3)} m (≤ ${allowed.toFixed(3)}: the tween's last ${(1 - prev.e).toExponential(1)} of ${L.toFixed(0)} m + one movie frame) · `
    + `then ${hand.map((v) => (v * 1000).toFixed(3)).join(', ')} m/s (≤ ${(bound(iL + 1) * 1000).toFixed(3)}: the movie ${(vMin * 1000).toFixed(3)}–${(vMax * 1000).toFixed(3)} m/s over ${win.length} frames, ts grain ${grain} ms, |Δv| ≤ ${(dvMax * 1000).toFixed(3)} m/s a frame) · `
    + `resolution: a clock skip ≥ ${(skipSec * 1000).toFixed(1)} ms (${(skipSec * 1000 / dtMed).toFixed(2)} frames)`
  return { fails, line, iL, vMed, dtMed }
}

/**
 * The hand-off's mutants, on THIS recording: each is red only by a failure the baseline does not have.
 *   stale landing (the chase removed): every flight frame lerps to the movie's pose at the click instead of the moving one
 *   clock jump at the first movie frame: the movie skips two frames of its clock
 *   a tween cut short: the camera one frame before landing sits where e(0.9) puts it (t and e as recorded: the camera moves, not the ref)
 */
function handoffMutants(rec) {
  const base = handoff(rec)
  if (base.refused || base.iL == null) return { refused: base.refused || base.fails.join(' · ') }
  const { out: s, p0 } = rec, iL = base.iL, v = base.vMed
  const d = s[iL + 1].p.map((c, i) => c - s[iL].p[i]), n = Math.hypot(...d) || 1, u = d.map((c) => c / n)
  const dtMed = base.dtMed
  const shift = (x, m) => ({ ...x, p: x.p.map((c, i) => c + u[i] * m) })
  const mutants = [
    ['stale landing (the chase removed)', s.map((x, k) => (k <= iL && x.to === 'movie' && x.e != null ? shift(x, -v * x.ms * (x.landed ? 1 : x.e)) : x))],
    ['a clock jump at the first movie frame', s.map((x, k) => (k > iL ? shift(x, v * 2 * dtMed) : x))],
    ['a tween cut short (lands from t 0.9)', s.map((x, k) => (k === iL - 1 ? { ...x, p: p0.map((c, i) => c + (s[iL].p[i] - c) * ease(0.9)) } : x))],
  ]
  const had = new Set(base.fails)
  return { base, results: mutants.map(([name, out]) => {
    const r = handoff({ out, p0 })
    return { name, killed: !!r.fails?.some((f) => !had.has(f)), why: r.fails?.find((f) => !had.has(f)) ?? r.refused }
  }) }
}

/**
 * The code mutant's verdict: killed only when the rewrite landed exactly once AND §2 MEASURED a failure. ⛔ A refusal
 * (too few movie frames, no p0, no landing) measured nothing, so it never counts as red (Zob, 2026-11-01).
 */
function codeMutantVerdict(applied, h) {
  if (applied !== 1) return { killed: false, why: `the rewrite landed ${applied} time(s), not 1: ShotFlight was not mutated as named` }
  if (!h || h.refused) return { killed: false, why: `§2 measured nothing (${h?.refused ?? 'no recording'})` }
  if (!h.fails.length) return { killed: false, why: '§2 stayed green with the chase removed' }
  return { killed: true, why: h.fails[0] }
}

// ── --replay=<dump>: §2 and its mutants on a saved dump (--dump's r2), no browser ──
if (arg('replay')) {
  const { r2 } = JSON.parse(readFileSync(arg('replay'), 'utf8'))
  const m = handoffMutants(r2)
  if (m.refused) { console.error(`⛔ NOT CHECKED — ${m.refused}`); process.exit(2) }
  console.log(`  ${m.base.line}`)
  for (const f of m.base.fails) console.log(`  ✗ ${f}`)
  let bad = m.base.fails.length
  for (const r of m.results) { console.log(`${r.killed ? '🔴' : '⚪ SURVIVED'} mutant: ${r.name}${process.argv.includes('-v') && r.why ? ` (${r.why})` : ''}`); if (!r.killed) bad++ }
  // The code mutant's guard, mutated: a refusal and a missed rewrite must each read SURVIVED, never red.
  for (const [name, applied, h] of [['a refused §2 counts as killed', 1, { refused: 'forced' }], ['a missed rewrite counts as killed', 0, { fails: ['§2 red'] }]]) {
    const v = codeMutantVerdict(applied, h)
    console.log(`${v.killed ? '⚪ SURVIVED' : '🔴'} mutant: ${name}`); if (v.killed) bad++
  }
  process.exit(bad ? 1 : 0)
}

const TOWN = requiredTown('town')
const BASE = arg('base') || 'http://localhost:5173'
// --code-mutant=chase: serve ShotFlight with the chase removed (`chase: d.chase` cut from the tween's start, in the
// response only: nothing on disk, nobody else's page). §2 must go red; the run passes only if it does.
const CODE_MUTANT = arg('code-mutant')
if (CODE_MUTANT && CODE_MUTANT !== 'chase') { console.error(`⛔ --code-mutant=${CODE_MUTANT}: the only code mutant is 'chase'`); process.exit(2) }
let mutantApplied = 0

const profile = mkdtempSync(join(tmpdir(), 'shot-flight-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' },
  ...(CODE_MUTANT ? [{ urlPattern: '*/src/camera/ShotFlight.jsx*', requestStage: 'Response' }] : [])] }, S)
ws.addEventListener('message', async (e) => {
  const m = JSON.parse(e.data)
  if (m.method !== 'Fetch.requestPaused') return
  if (m.params.responseStatusCode != null) {
    const { body, base64Encoded } = await cdp('Fetch.getResponseBody', { requestId: m.params.requestId }, m.sessionId)
    const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body
    const hits = text.split('chase: d.chase').length - 1
    mutantApplied += hits
    cdp('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: m.params.responseStatusCode,
      responseHeaders: m.params.responseHeaders, body: Buffer.from(text.replace('chase: d.chase', 'chase: null')).toString('base64') }, m.sessionId).catch(() => {})
    return
  }
  // ⛔ A throwaway profile sends nothing: every non-GET is refused.
  if (m.params.request.method !== 'GET' && m.params.request.method !== 'HEAD') cdp('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }, m.sessionId).catch(() => {})
  else cdp('Fetch.continueRequest', { requestId: m.params.requestId }, m.sessionId).catch(() => {})
})
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S)).result?.value

const fails = []
const done = (code) => { ws.close(); cleanup(); process.exit(code) }

// Ready: the camera exists and the town reported its first shot (Preview opens in its last shot, else Browse).
let ready = false
for (let i = 0; i < 90 && !ready; i++) {
  await sleep(1000)
  ready = await js('!!(window.__camera && window.__flight?.current?.landed)')
}
if (!ready) { console.error('⛔ the Preview never reported a landed shot through window.__flight (Town\'s flight ref) — nothing to measure'); done(1) }
await sleep(2000)

// Record every frame for `ms`, after clicking the shot button labelled `label` (and optionally a wheel at `wheelAt` ms).
const record = (label, ms, wheelAt = null) => js(`new Promise((resolve) => {
  const c = window.__camera, ctl = window.__controls, out = []
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)})
  if (!btn) return resolve({ error: 'no button ${label}' })
  const t0 = performance.now(), p0 = c.position.toArray()   // p0: the camera at the click, the tween's from
  const tick = (ts) => {   // ts: the rAF timestamp, the movie's own clock; ms: performance.now(), the flight clauses'
    const f = window.__flight?.current || {}
    const v = c.view && c.view.enabled ? [c.view.offsetX, c.view.offsetY] : [0, 0]
    out.push({ ms: performance.now() - t0, ts: ts - t0, p: c.position.toArray(), tg: ctl ? ctl.target.toArray() : null, off: v,
      t: f.t ?? null, e: f.eased ?? null, at: f.at ?? null, landed: !!f.landed, interrupted: !!f.interrupted, from: f.from, to: f.to })
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick); else resolve({ out, p0 })
  }
  btn.click(); requestAnimationFrame(tick)
  ${wheelAt != null ? `setTimeout(() => document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, clientX: 640, clientY: 400 })), ${wheelAt})` : ''}
})`)

if (arg('dump')) console.log('  before: flight', await js('JSON.stringify(window.__flight?.current ?? null)'), '· camera', await js('JSON.stringify(window.__camera.position.toArray().map(v => +v.toFixed(1)))'))
// ── 0. into the movie, and let it play ──
const r0 = await record('Hero', SHOT_TRANSITION_MS.hero + 1500)
if (r0.error) { fails.push(r0.error) } else if (!r0.out.some((x) => x.to === 'movie' && x.landed)) fails.push('entering the movie never landed')
await sleep(2000)

// ── 1. movie → plan ────────────────────────────────────────────────────────────────
const PLAN_MS = SHOT_TRANSITION_MS.browse
const r1 = await record('Browse', PLAN_MS + 1500)
if (r1.error) { fails.push(r1.error) } else {
  const s = r1.out
  const i0 = s.findIndex((x) => x.t != null && x.to === 'plan' && !x.landed)
  const iL = s.findIndex((x) => x.landed && x.to === 'plan')
  if (i0 < 0 || iL < 0) fails.push(`movie → plan: the flight ref never ${i0 < 0 ? 'started' : 'landed'} (to=plan)`)
  else {
    const span = s.slice(i0, iL + 1)
    const moving = span.filter((x, k, a) => k && dist(x.p, a[k - 1].p) > 1e-3).length
    if (moving < 8 || moving < 0.5 * (span.length - 1)) fails.push(`movie → plan moved on ${moving} of ${span.length - 1} frames — a cut, not a flight`)
    // DURATION on the wall clock: the slope of the flight's t against `at`, the performance.now() of the frame that
    // computed it (each distinct t once — a frame the canvas skipped leaves t stale).
    const fl = s.slice(i0, iL).filter((x, k, a) => x.t > 0 && x.t < 1 && x.at != null && (!k || x.t !== a[k - 1].t))
    const n = fl.length, mx = fl.reduce((a, x) => a + x.at, 0) / n, mt = fl.reduce((a, x) => a + x.t, 0) / n
    const slope = fl.reduce((a, x) => a + (x.at - mx) * (x.t - mt), 0) / fl.reduce((a, x) => a + (x.at - mx) ** 2, 0)
    const measured = 1 / slope
    // The frame clock and the flight's clock are one clock, so this is exact to float precision: ± 1%.
    if (!(Math.abs(measured - PLAN_MS) <= 0.01 * PLAN_MS)) fails.push(`movie → plan runs ${measured.toFixed(0)} ms on the wall clock — transitions.js says ${PLAN_MS} (± 1%)`)
    // CURVE: the camera's position is linear in easeInOutCubic(t) — fit pos = a + b·ease(t), bound the residual as a
    // fraction of the whole move.
    let maxErr = 0, maxRef = 0
    for (let c = 0; c < 3; c++) {
      const es = fl.map((x) => ease(x.t)), ps = fl.map((x) => x.p[c])
      const me = es.reduce((a, v) => a + v, 0) / n, mp = ps.reduce((a, v) => a + v, 0) / n
      const b = es.reduce((a, v, k) => a + (v - me) * (ps[k] - mp), 0) / es.reduce((a, v) => a + (v - me) ** 2, 0)
      const a0 = mp - b * me
      if (Math.abs(b) < 1) continue                   // this axis barely moves; its noise is not the curve
      for (let k = 0; k < n; k++) maxErr = Math.max(maxErr, Math.abs(ps[k] - (a0 + b * es[k])) / Math.abs(b))
    }
    for (const x of fl) if (x.e != null) maxRef = Math.max(maxRef, Math.abs(x.e - ease(x.t)))
    if (maxErr > 0.02) fails.push(`movie → plan: the camera's progress departs from easeInOutCubic by ${maxErr.toFixed(3)} of the move (≤ 0.02)`)
    if (maxRef > 1e-6) fails.push(`the flight ref's eased is not easeInOutCubic(t) (off by ${maxRef.toExponential(1)})`)
    const last = s[s.length - 1]
    if (last.tg && (Math.hypot(last.p[0] - last.tg[0], last.p[2] - last.tg[2]) > 0.5 || last.p[1] <= last.tg[1])) fails.push('plan did not land in a true overhead (camera not directly above its target)')
    console.log(`  movie → plan: ${moving} moving frames · ${measured.toFixed(0)} ms on the wall clock (transitions.js ${PLAN_MS}) · off easeInOutCubic by ${maxErr.toFixed(4)} of the move`)
  }
}

// ── 2. plan → movie: lands on the MOVING path ─────────────────────────────────────
const MOVIE_MS = SHOT_TRANSITION_MS.hero
const r2 = await record('Hero', MOVIE_MS + 1500)
let h2 = null   // §2's verdict, kept whole: the code mutant reads its MEASURED failures, never a refusal
if (r2.error) { fails.push(r2.error) } else {
  h2 = handoff(r2)   // ⭐ the hand-off's bounds and why: handoff(), above
  if (h2.refused) fails.push(`plan → movie: NOT MEASURED — ${h2.refused}`)
  else { fails.push(...h2.fails); if (h2.line) console.log(`  ${h2.line}`) }
}
if (CODE_MUTANT) {
  if (arg('dump')) (await import('node:fs')).writeFileSync(arg('dump'), JSON.stringify({ r1, r2 }))
  const v = codeMutantVerdict(mutantApplied, h2)
  console.log(`${v.killed ? '🔴' : '⚪ SURVIVED'} code mutant: the chase removed (ShotFlight served with ${mutantApplied} rewrite(s)) — ${v.why}`)
  done(v.killed ? 0 : 1)
}

// ── 3. a gesture mid-flight ends it where it is ───────────────────────────────────
await sleep(1500)
const r3 = await record('Browse', 1500, 700)
if (r3.error) fails.push(r3.error)
else {
  const end = r3.out.find((x) => x.interrupted)
  if (!end) fails.push('a wheel mid-flight did not end the flight (the ref never reported interrupted)')
  else if (!(end.t < 1)) fails.push(`the interrupted flight reported t = ${end.t} — it should end where it is (t < 1)`)
  else console.log(`  wheel at 700 ms: interrupted at t = ${end.t.toFixed(2)}`)
}

// ── 4. the view inset ──────────────────────────────────────────────────────────────
const TOP = 320
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}&inset=${TOP},0,0,0` }, S)
let ready4 = false
for (let i = 0; i < 90 && !ready4; i++) { await sleep(1000); ready4 = await js('!!(window.__camera && window.__flight?.current?.landed)') }
if (!ready4) fails.push('the inset Preview never reported a landed shot')
else {
  await sleep(1500)
  const m = await record('Hero', SHOT_TRANSITION_MS.hero + 1200)
  if (arg('dump')) (await import('node:fs')).writeFileSync(arg('dump') + '.inset.json', JSON.stringify({ m }))
  const mv = m.out?.[m.out.length - 1]
  if (!mv || mv.off[0] !== 0 || mv.off[1] !== 0) fails.push(`the movie carries a view offset (${mv?.off}) — it is full frame`)
  await sleep(1500)
  const pl = await record('Browse', PLAN_MS + 1200)
  // Canvas pixels: the inset is measured from the canvas's own edges (Preview's app bar sits above it).
  const at = await js(`(() => { const c = window.__camera, t = window.__controls.target.clone().project(c)
    const b = document.querySelector('canvas').getBoundingClientRect()
    return { y: (1 - t.y) / 2 * b.height, x: (1 + t.x) / 2 * b.width, H: b.height, W: b.width } })()`)
  const want = TOP + (at.H - TOP) / 2
  if (Math.abs(at.y - want) > 3 || Math.abs(at.x - at.W / 2) > 3) fails.push(`with inset top ${TOP}, the plan's target sits at (${at.x.toFixed(0)}, ${at.y.toFixed(0)}) px — the free region's centre is (${(at.W / 2).toFixed(0)}, ${want.toFixed(0)})`)
  const mid = (pl.out || []).filter((x) => x.to === 'plan' && !x.landed && x.t > 0.2 && x.t < 0.8)
  const offErr = Math.max(0, ...mid.map((x) => Math.abs(x.off[1] - x.e * (-TOP / 2))))
  if (!mid.length) fails.push('the inset plan flight was not observed mid-flight')
  else if (offErr > 1) fails.push(`mid-flight the view offset is off the flight's eased fraction by ${offErr.toFixed(1)} px`)
  else console.log(`  inset top ${TOP}: plan target at y ${at.y.toFixed(0)} px (free centre ${want.toFixed(0)}) · offset rides the eased curve (≤ ${offErr.toFixed(2)} px)`)
}

// ── 5. the plan's one move, the rose, reduced motion ──────────────────────────────────
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
let ready5 = false
for (let i = 0; i < 90 && !ready5; i++) { await sleep(1000); ready5 = await js('!!(window.__townProbe && window.__flight?.current?.landed && window.__townProbe.listingIds.length)') }
if (!ready5) fails.push('the Preview never offered window.__townProbe with its listings')
else {
  if ((await js('window.__flight.current.to')) !== 'plan') { await record('Browse', PLAN_MS + 800) }
  await sleep(1500)
  const pos = () => js('JSON.stringify(window.__camera.position.toArray())').then(JSON.parse)
  // a. lighting places — what typing does — never moves the camera
  const ids = await js('JSON.stringify(window.__townProbe.listingIds.slice(-6))').then(JSON.parse)
  const p0 = await pos()
  await js(`window.__townProbe.setLitIds(${JSON.stringify(ids)})`)
  await sleep(1500)
  const p1 = await pos()
  if (dist(p0, p1) > 0.01) fails.push(`lighting ${ids.length} places moved the camera ${dist(p0, p1).toFixed(2)} m — typing must never move it`)
  // b. frameKey: the one move, on transitions.js' `frame`, and the disclosure
  const nFramed = await js('window.__townProbe.framed.length')
  const fk = await js(`new Promise((resolve) => { const out = []; const t0 = performance.now()
    window.__townProbe.setFrameKey((k) => k + 1)
    const tick = () => { const f = window.__flight.current || {}; out.push({ t: f.t, at: f.at, to: f.to, from: f.from, landed: f.landed })
      if (performance.now() - t0 < ${SHOT_TRANSITION_MS.frame} + 900) requestAnimationFrame(tick); else resolve(out) }
    requestAnimationFrame(tick) })`)
  const mv = fk.filter((x, k, a) => x.from === 'plan' && x.to === 'plan' && x.t > 0 && x.t < 1 && x.at != null && (!k || x.t !== a[k - 1].t))
  if (mv.length < 4) fails.push(`a frameKey change did not fly plan → plan (${mv.length} flight frames seen)`)
  else {
    const n = mv.length, mx = mv.reduce((a, x) => a + x.at, 0) / n, mt = mv.reduce((a, x) => a + x.t, 0) / n
    const ms = 1 / (mv.reduce((a, x) => a + (x.at - mx) * (x.t - mt), 0) / mv.reduce((a, x) => a + (x.at - mx) ** 2, 0))
    if (!(Math.abs(ms - SHOT_TRANSITION_MS.frame) <= 0.01 * SHOT_TRANSITION_MS.frame)) fails.push(`the frameKey move runs ${ms.toFixed(0)} ms — transitions.js' frame says ${SHOT_TRANSITION_MS.frame}`)
    const f = await js('JSON.stringify(window.__townProbe.framed[window.__townProbe.framed.length - 1])').then(JSON.parse)
    if ((await js('window.__townProbe.framed.length')) <= nFramed || f?.of !== ids.length) fails.push(`onFramed did not disclose the frame of the ${ids.length} lit places (got ${JSON.stringify(f)})`)
    else console.log(`  frameKey: plan → plan in ${ms.toFixed(0)} ms (frame ${SHOT_TRANSITION_MS.frame}) · onFramed placed ${f.placed}/${f.of}, outside ${f.outside.length}, unplaced ${f.unplaced.length}`)
  }
  // c. the rose
  const heading = await js(`fetch('/baked/${TOWN}/scene.json').then(r => r.json()).then(s => s.browseHeading?.values?.value ?? 0)`)
  const off = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180)
  await js("window.__townProbe.setPlanHeading('north')"); await sleep(SHOT_TRANSITION_MS.frame + 800)
  const bN = await js('window.__townProbe.bearingRef.current')
  await js("window.__townProbe.setPlanHeading('town')"); await sleep(SHOT_TRANSITION_MS.frame + 800)
  const bT = await js('window.__townProbe.bearingRef.current')
  if (!(off(bN, 0) <= 1)) fails.push(`planHeading 'north' left the bearing at ${bN?.toFixed?.(1)}° — north up is 0`)
  if (!(off(bT, heading) <= 1)) fails.push(`planHeading 'town' left the bearing at ${bT?.toFixed?.(1)}° — the town's browseHeading is ${heading}°`)
  // c'. follow: the map turns with the reader's true heading every frame — no flight once following; null holds north
  await js("window.__townProbe.followRef.current = 90; window.__townProbe.setPlanHeading('follow')"); await sleep(SHOT_TRANSITION_MS.frame + 800)
  const bF1 = await js('window.__townProbe.bearingRef.current')
  const followed = await js(`new Promise((resolve) => { const p = window.__townProbe; const f0 = p.bearingRef.current
    p.followRef.current = 180; let n = 0
    const tick = () => { if (++n < 3) requestAnimationFrame(tick); else resolve({ b: p.bearingRef.current, t: window.__flight.current.t }) }
    requestAnimationFrame(tick) })`)
  const bF0 = await js(`new Promise((resolve) => { const p = window.__townProbe; p.followRef.current = null; let n = 0
    const tick = () => { if (++n < 3) requestAnimationFrame(tick); else resolve(p.bearingRef.current) }
    requestAnimationFrame(tick) })`)
  if (!(off(bF1, 90) <= 1)) fails.push(`following heading 90°, the bearing is ${bF1?.toFixed?.(1)}°`)
  if (!(off(followed.b, 180) <= 1)) fails.push(`the heading moved to 180° and 2 frames later the bearing is ${followed.b?.toFixed?.(1)}° — a follow turns every frame, it does not fly`)
  if (!(off(bF0, 0) <= 1)) fails.push(`a null heading while following left the bearing at ${bF0?.toFixed?.(1)}° 2 frames later — it holds north up`)
  await js("window.__townProbe.setPlanHeading('town')"); await sleep(SHOT_TRANSITION_MS.frame + 800)
  if (off(bF1, 90) <= 1 && off(followed.b, 180) <= 1 && off(bF0, 0) <= 1) console.log(`  follow: 90° → ${bF1.toFixed(1)}° · then 180° within 2 frames → ${followed.b.toFixed(1)}° · null → ${bF0.toFixed(1)}° (north)`)
  if (off(bN, 0) <= 1 && off(bT, heading) <= 1) console.log(`  rose: north → ${bN.toFixed(1)}° · town → ${bT.toFixed(1)}° (browseHeading ${heading}°${heading === 0 ? ' — the same bearing: a turn is proven by claims-one-shot-flight\'s arithmetic, not here' : ''})`)
  // d. reduced motion: a shot change is a cut
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, S)
  const rm = await record('Hero', 1200)
  await cdp('Emulation.setEmulatedMedia', { features: [] }, S)
  const mid = (rm.out || []).filter((x) => x.to === 'movie' && x.t > 0 && x.t < 1)
  if (!(rm.out || []).some((x) => x.to === 'movie' && x.landed)) fails.push('under reduced motion the shot change never landed')
  else if (mid.length) fails.push(`under prefers-reduced-motion the shot change flew (${mid.length} frames with 0 < t < 1) — it must cut`)
  else console.log('  reduced motion: the shot change is a cut')
}

if (arg('dump')) (await import('node:fs')).writeFileSync(arg('dump'), JSON.stringify({ r1, r2, r3 }))
if (fails.length) { console.error(`⛔ ${fails.length} failure(s):`); for (const f of fails) console.error('   ' + f); done(1) }
console.log('✅ a shot change flies on the old player\'s clock and curve, and lands where the shot is')
done(0)
