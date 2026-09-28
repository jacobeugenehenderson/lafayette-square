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
 *   2. plan → movie flies into the MOVING path: after landing the camera keeps moving with no jump (no frame step
 *      > 4 × the median step around the landing).
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
 * ⛔ READ-ONLY. Usage: node checks/claims-a-shot-change-flies.mjs [--town=huron] [--base=http://localhost:5173]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SHOT_TRANSITION_MS } from '../src/camera/transitions.js'

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const TOWN = arg('town') || 'huron'
const BASE = arg('base') || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

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
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, S)
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method !== 'Fetch.requestPaused') return
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
  const t0 = performance.now()
  const tick = () => {
    const f = window.__flight?.current || {}
    const v = c.view && c.view.enabled ? [c.view.offsetX, c.view.offsetY] : [0, 0]
    out.push({ ms: performance.now() - t0, p: c.position.toArray(), tg: ctl ? ctl.target.toArray() : null, off: v,
      t: f.t ?? null, e: f.eased ?? null, at: f.at ?? null, landed: !!f.landed, interrupted: !!f.interrupted, from: f.from, to: f.to })
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick); else resolve({ out })
  }
  btn.click(); requestAnimationFrame(tick)
  ${wheelAt != null ? `setTimeout(() => document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, clientX: 640, clientY: 400 })), ${wheelAt})` : ''}
})`)

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

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
if (r2.error) { fails.push(r2.error) } else {
  const s = r2.out
  const iL = s.findIndex((x) => x.landed && x.to === 'movie')
  if (iL < 0) fails.push('plan → movie: the flight never landed (to=movie)')
  else {
    // SPEED (m per ms), not per frame: a long frame at the landing (the movie's own pieces mount there) advances the
    // movie's clock by that frame's time, a stutter, not a missed chase. The movie's own speed just after landing,
    // against the speed at the landing itself.
    const speed = (k) => dist(s[k].p, s[k - 1].p) / Math.max(1, s[k].ms - s[k - 1].ms)
    const pace = s.slice(iL + 1, iL + 11).map((_, j) => speed(iL + 1 + j)).filter(Number.isFinite).sort((a, b) => a - b)
    const med = pace[pace.length >> 1]
    const jump = Math.max(speed(iL - 1), speed(iL), speed(iL + 1))
    const after = dist(s[s.length - 1].p, s[iL].p)
    if (after < 1e-3) fails.push('plan → movie: the camera stopped after landing — it landed on a still pose, not the moving path')
    if (med > 0 && jump > 4 * med) fails.push(`plan → movie: the camera moves ${(jump * 1000).toFixed(1)} m/s at the landing, the movie ${(med * 1000).toFixed(1)} m/s — the flight did not chase the moving pose`)
    console.log(`  plan → movie: landed at ${s[iL].ms.toFixed(0)} ms · ${(jump * 1000).toFixed(1)} m/s at the landing (the movie's own ${(med * 1000).toFixed(1)} m/s)`)
  }
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
