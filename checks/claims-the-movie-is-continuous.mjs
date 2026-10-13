#!/usr/bin/env node
/**
 * "DOES EVERY AUTHORED SHOT PLAY WITH NO STEP — AND HIT EVERY KEY AT ITS TIME?"
 *
 * WHY (BRIEF-the-movie-is-continuous; Jacob 2026-10-11: "get rid of the quantization from the camera moves … we only
 * need to hit the keyframes"). The path through the keys is closed-form, but two quantizers sat on it:
 *   · the PACE was read off a 64-cell table, linearly, so the speed jumped at every cell edge (0.5–1%, up to 10% on
 *     Huron beside its middle key);
 *   · the DRIVER wrote the FOV only when it had moved more than 0.1°, so a slow zoom stepped (~418 notches a cycle).
 * Both are gone. This holds them gone, on every town's own shot.
 *
 * THE RULES, measured on each Look's authored shot (public/looks/<town>/design.json — read, never restated):
 *   1. every key is hit at its time (position, aim, fov within 1e-6);
 *   2. the pace has no kink: the speed along the path (position and aim together — what the pace is solved over),
 *      sampled every H s, has no second difference beyond KINK of itself. A linear read inside a cell puts a step in
 *      the speed at each cell edge; a solved pace is smooth to the solver's tolerance;
 *   3. the fov is continuous along the path; its rate is continuous through every key and it never overshoots a key
 *      (a monotone cubic on the path's parameter — Jacob, 2026-10-11); and the DRIVER writes the path's fov on every
 *      60 Hz frame (src/camera/MovieCamera.jsx#writeLens), never a threshold behind it.
 *   4. the CLOCK steps by the presented frame (MovieCamera#presentedClock — each frame's rAF timestamp), not by r3f's
 *      `delta` (performance.now() at render: measured 22–37% p95 frame-to-frame unevenness on screen in Jacob's Chrome):
 *      the true interval each frame, 0 after a reset (entering, a tab returning from hidden), 0 on a second render
 *      inside one frame, never capped; and the driver's frame loop advances the movie clock by it and by nothing else.
 * A town whose Look has no moving shot is printed as a still shot — a real state, not a pass.
 *
 * ⛔ MUTATIONS (--self-test, and every run): the pace solve removed from heroAnim.js (`// solve:begin … // solve:end`
 *    — the cell's linear read is what remains) must go RED on rule 2; the 0.1° gate put back in writeLens must go RED
 *    on rule 3; r3f's `delta` written back as the clock's advance must go RED on rule 4; the fov put back as a straight line between keys (`// fov:begin … // fov:end`) must go RED on 3b. A check that cannot see the defect it was written for proves nothing.
 * ⛔ READ-ONLY. Usage: node checks/claims-the-movie-is-continuous.mjs [town …]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const ROOT = new URL('..', import.meta.url).pathname
const ANIM = 'src/preview/heroAnim.js', DRIVER = 'src/camera/MovieCamera.jsx'
// KINK: a speed STEP of 0.1% between H-second samples. The table stepped 4.8–9.6% (measured 2026-10-11); the solved pace
// stays under 0.015%, all of it at the keys, where the monotone cubic keeps the speed continuous but not its slope.
const H = 0.005, KINK = 1e-3, KEY_EPS = 1e-6
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const towns = (want.length ? want : readdirSync(join(ROOT, 'public/looks')).filter((t) => existsSync(join(ROOT, 'public/looks', t, 'design.json'))))
  .map((t) => { const d = JSON.parse(readFileSync(join(ROOT, 'public/looks', t, 'design.json'), 'utf8')); return { town: t, k: d.heroKeyframes, m: d.heroMotion } })

const hyp6 = (a, b, c, d) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], c[0] - d[0], c[1] - d[1], c[2] - d[2])

// Rules 1–3 for one shot, against one heroAnim module and one lens writer. Returns the failures.
function audit({ town, k, m }, anim, writeLens) {
  const f = [], L = m.length, P = [0, 0, 0], T = [0, 0, 0]
  const pose = (s) => { const r = anim.heroPoseAtTime(k, m, s, P, T); return { p: [...P], t: [...T], fov: r.fov } }
  // 1. keys hit
  for (const [i, key] of k.entries()) {
    const q = pose(key.t * L)
    const e = Math.max(hyp6(q.p, key.position, [0, 0, 0], [0, 0, 0]), hyp6(q.t, key.target, [0, 0, 0], [0, 0, 0]), Math.abs(q.fov - key.fov))
    if (!(e <= KEY_EPS)) f.push(`${town}: key ${i} missed at its time ${key.t * L} s by ${e.toExponential(2)}`)
  }
  // 2. no kink in the pace · 3a. fov continuous along the path
  // The speed over each H step; a kink is a second difference that is a visible share of the speed itself.
  let prev = pose(0), vA = null, vB = null, worst = { r: 0, s: 0 }, fovJump = 0
  for (let s = H; s <= L; s += H) {
    const c = pose(s), vC = hyp6(c.p, prev.p, c.t, prev.t) / H
    fovJump = Math.max(fovJump, Math.abs(c.fov - prev.fov))
    if (vA != null) { const r = Math.abs(vC - 2 * vB + vA) / Math.max(vC, 1e-6); if (r > worst.r) worst = { r, s } }
    vA = vB; vB = vC; prev = c
  }
  if (!(worst.r <= KINK)) f.push(`${town}: the pace kinks — the speed's second difference is ${(100 * worst.r).toFixed(3)}% of itself at ${worst.s.toFixed(2)} s (tolerance ${100 * KINK}%)`)
  // The fov's largest step along the path, against its whole change spread evenly over the shot: a jump is many times that.
  const fovSpan = Math.max(...k.map((x) => x.fov)) - Math.min(...k.map((x) => x.fov))
  if (fovJump > 10 * fovSpan * H / L + 1e-9) f.push(`${town}: the fov jumps ${fovJump.toFixed(4)}° in ${H} s along the path`)
  // 3b. the zoom's rate is continuous through every key the shot passes (a straight line between keys turns the zoom on
  //     at full rate at a key), and never overshoots a key: the fov stays between its two keys on every segment.
  const peak = Math.max(1e-9, ...Array.from({ length: 2000 }, (_, i) => Math.abs(pose((i + 1) * L / 2001).fov - pose(i * L / 2001).fov) / (L / 2001)))
  for (const [i, key] of k.entries()) {
    const s = key.t * L
    if (s <= 0 || s >= L) continue
    const before = (pose(s).fov - pose(s - 1e-3).fov) / 1e-3, after = (pose(s + 1e-3).fov - pose(s).fov) / 1e-3
    if (Math.abs(after - before) > 0.01 * peak) f.push(`${town}: the zoom's rate breaks at key ${i} (${before.toFixed(4)} → ${after.toFixed(4)} °/s)`)
  }
  for (let i = 0; i + 1 < k.length; i++) {
    const lo = Math.min(k[i].fov, k[i + 1].fov) - 1e-9, hi = Math.max(k[i].fov, k[i + 1].fov) + 1e-9
    for (let j = 1; j < 200; j++) { const v = pose((k[i].t + (k[i + 1].t - k[i].t) * j / 200) * L).fov; if (v < lo || v > hi) { f.push(`${town}: the fov overshoots between keys ${i} and ${i + 1} (${v.toFixed(3)}°)`); break } }
  }
  // 3c. the driver writes the path's fov on every 60 Hz frame
  const cam = { fov: k[0].fov, updateProjectionMatrix() {} }, out = { set() {} }
  let lag = 0
  for (let c = 0; c < anim.heroCycleSec(m); c += 1 / 60) {
    const r = anim.heroKeyframeAnim(c, k, m, out, out)
    writeLens(cam, r.fov)
    lag = Math.max(lag, Math.abs(cam.fov - r.fov))
  }
  if (lag > 1e-9) f.push(`${town}: the driver's lens lags the path's fov by up to ${lag.toFixed(3)}° — a write gate is back`)
  return { fails: f, kink: worst.r, lag }
}

// The modules: heroAnim imported as-is; the driver's writeLens through vite (it is JSX).
const tmp = mkdtempSync(join(tmpdir(), 'movie-continuous-'))
const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
let code = 0
try {
  const anim = await import(pathToFileURL(join(ROOT, ANIM)).href)
  const { writeLens } = await vite.ssrLoadModule('/' + DRIVER)
  if (typeof writeLens !== 'function') throw new Error(`${DRIVER} exports no writeLens — the driver's lens write moved; re-aim this check`)
  const driverSrc = readFileSync(join(ROOT, DRIVER), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const fails = []
  // 4. the presented clock, and the driver advancing the movie clock by it alone
  const { presentedClock } = await vite.ssrLoadModule('/' + DRIVER)
  if (typeof presentedClock !== 'function') throw new Error(`${DRIVER} exports no presentedClock — the movie's clock moved; re-aim this check`)
  {
    const pc = presentedClock(), got = []
    for (const ts of [1000, 1016.7, 1050, 1050, 1066.7]) { pc.stamp(ts); got.push(+pc.step().toFixed(4)) }
    pc.reset(); pc.stamp(9000); got.push(pc.step()); pc.stamp(9500); got.push(pc.step())
    const want = [0, 0.0167, 0.0333, 0, 0.0167, 0, 0.5]
    if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`presentedClock steps ${JSON.stringify(got)}, not ${JSON.stringify(want)} (true interval; 0 after a reset and on a repeat frame; a long frame is NOT capped)`)
  }
  const advances = (txt) => [...txt.matchAll(/clock\.current\s*\+=\s*([^\n]*)/g)].map((m) => m[1])
  const clockRule = (txt) => { const a = advances(txt); return a.length === 1 && /presented\.current\.step\(\)/.test(a[0]) && !/\bdelta\b/.test(a[0]) }
  if (!clockRule(driverSrc)) fails.push(`${DRIVER}'s frame loop advances the movie clock by something other than the presented clock: ${JSON.stringify(advances(driverSrc))}`)
  else {
    const deltaMutant = driverSrc.replace(/clock\.current\s*\+=\s*presented\.current\.step\(\)/, 'clock.current += delta')
    if (clockRule(deltaMutant)) fails.push('⛔ MUTATION SURVIVED: with r3f\'s delta written back as the clock\'s advance, rule 4 passed — it is blind')
  }
  if (/camera\.fov\s*=/.test(driverSrc.replace(/export function writeLens[\s\S]*?\n}\n/, ''))) fails.push(`${DRIVER} writes camera.fov outside writeLens`)

  // ⛔ the mutants
  const animSrc = readFileSync(join(ROOT, ANIM), 'utf8')
  if (!/\/\/ solve:begin[\s\S]*\/\/ solve:end/.test(animSrc)) throw new Error(`${ANIM} has no // solve:begin … // solve:end block — the pace solve moved; re-aim this check`)
  const mutantPath = join(tmp, 'heroAnim.table.mjs')
  writeFileSync(mutantPath, animSrc.replace(/\/\/ solve:begin[\s\S]*\/\/ solve:end/, ''))
  const tableAnim = await import(pathToFileURL(mutantPath).href)
  if (!/\/\/ fov:begin[\s\S]*\/\/ fov:end/.test(animSrc)) throw new Error(`${ANIM} has no // fov:begin … // fov:end block — the lens interpolation moved; re-aim this check`)
  const linearPath = join(tmp, 'heroAnim.linear.mjs')
  writeFileSync(linearPath, animSrc.replace(/\/\/ fov:begin[\s\S]*\/\/ fov:end/, 'return fov[a] + lam * (fov[b] - fov[a])'))
  const linearAnim = await import(pathToFileURL(linearPath).href)
  const gated = (camera, fov) => { if (Math.abs(camera.fov - fov) > 0.1) camera.fov = fov }

  const moving = towns.filter((x) => x.k?.length > 1)
  for (const x of towns) if (!(x.k?.length > 1)) console.log(`  ${x.town}: a still shot (${x.k?.length ?? 0} authored key) — nothing moves, nothing to step`)
  if (!moving.length) throw new Error('no Look carries a moving shot — nothing was checked')
  let tableRed = false, gateRed = false, linearRed = false
  for (const x of moving) {
    const r = audit(x, anim, writeLens)
    fails.push(...r.fails)
    const mt = audit(x, tableAnim, writeLens), mg = audit(x, anim, gated)
    tableRed ||= mt.fails.some((s) => s.includes('kinks'))
    const zooms = new Set(x.k.map((q) => q.fov)).size > 1
    if (zooms) gateRed ||= mg.fails.some((s) => s.includes('lags'))
    const ml = audit(x, linearAnim, writeLens)
    linearRed ||= ml.fails.some((s) => s.includes('rate breaks'))
    console.log(`  ${x.town}: ${x.k.length} keys, ${x.m.mode} ${x.m.length} s · pace kink ${(100 * r.kink).toFixed(5)}% (table mutant ${(100 * mt.kink).toFixed(3)}%) · lens lag ${r.lag.toFixed(4)}°${zooms ? ` (0.1° gate mutant ${mg.lag.toFixed(3)}°)` : ' (no zoom)'}`)
  }
  if (!tableRed) fails.push('⛔ MUTATION SURVIVED: with the pace solve removed (the linear table back), no town went red — rule 2 is blind')
  if (!linearRed) fails.push('⛔ MUTATION SURVIVED: with the fov a straight line between keys, no town went red — rule 3b is blind (or no Look zooms through a key: then it is untested, say so)')
  if (!gateRed) fails.push('⛔ MUTATION SURVIVED: with the 0.1° gate back, no zooming town went red — rule 3 is blind (or no Look zooms: then it is untested, say so)')
  console.log(fails.length ? `⛔ ${fails.join('\n⛔ ')}` : `✅ every moving shot hits its keys at their times, its pace has no kink, its lens is written every frame, its clock is the presented frame's — and all four mutants went red`)
  code = fails.length ? 1 : 0
} catch (e) { console.error(`⛔ ${e.message}`); code = 2 }
finally { await vite.close(); rmSync(tmp, { recursive: true, force: true }) }
process.exit(code)
