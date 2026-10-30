#!/usr/bin/env node
/**
 * "DOES THE OVERHEAD CAMERA RESOLVE ITS GROUND ON A LINEAR DEPTH BUFFER — AT EVERY OVERHEAD ZOOM AND LEAN?"
 *
 * WHY (BRIEF-the-overhead-camera-resolves-its-ground; Jacob 2026-10-30, live PTown on his iPhone: "almost no visible
 * water, only seabed"). The phone draws through LINEAR depth (QUALITY.phone.logDepth false), whose step at view depth z
 * is z² / (near · 2²⁴). The plan kept the canvas's near of 1 m, so at Browse's 6.5 km the step was 2.5 m and at Society's
 * 19.7 km 23 m, while the ground's layers stand GROUND_Y_EPS (2 mm) apart (bake-ground.js) and the water 0.102 m over
 * the bed: the bed won the depth test across the harbour. Measured on production by setting near live (probe:
 * scratch/overhead-depth/probe-near.mjs): near 1 sand · near 100 and the derived near clean, Browse and Society.
 *
 * THE RULES. cameraRegimes.js#overheadNear is extracted from the source and run on a real three camera:
 *   1. it never clips: its near is ≤ the view depth of the plane y = topY at every point of a fine screen grid;
 *   2. it is tight: within 1% of that grid minimum (a corner, not a guess);
 *   3. the ground resolves: the linear 24-bit step at the FARTHEST ground in view is reported, and the step at the ground
 *      under the screen centre is < GROUND_Y_EPS, read from cartograph/bake-ground.js, from the overhead regime's
 *      minDistance to its maxDistance (REGIMES.plan, read), straight down and at PLAN_MAX_LEAN_DEG, phone and desktop
 *      aspects, the Browse fov (SHOTS_FLAT_DEFAULTS.browse.fov, read);
 *   4. it refuses to guess: the floor when the camera is not above topY, when topY is unknown, when no corner ray points down;
 *   5. Town.jsx#TownOptics holds near from it in the plan, over the town's drawn top plus terrainCeilingRaw × the live
 *      terrainExag, with the sky and clouds groups excluded by the names Town gives them.
 * Mutants (--mutants): near pinned at the floor · the near edge's corners dropped · the centre ray only · the floor removed · the
 * terrain ceiling dropped from TownOptics. Each must turn the check RED.
 *
 * --live --town=<t> --base=<url> [--out=<dir>]: Preview on a running dev server, headless (a throwaway profile, every non-GET
 * failed), as phone-lo (linear depth) and desktop, in Browse: reads the live camera's near at the Browse frame and dollied
 * to 3× and to maxDistance (Society's height), judges the step at the ground under the centre against GROUND_Y_EPS, and
 * screenshots each for the eye; then the movie (Hero) holds the profile's movieNear and Street the canvas's near.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-the-overhead-camera-resolves-its-ground.mjs [--mutants | --live --town=<t> --base=<url>]
 */
import { readFileSync } from 'fs'
import * as THREE from 'three'

const ROOT = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(ROOT + p, 'utf8')
const REG = read('src/lib/cameraRegimes.js'), TOWN = read('src/components/Town.jsx')
const num = (src, re, what) => { const m = src.match(re); if (!m) { console.log(`⛔ CANNOT RUN — ${what} not found in source`); process.exit(2) } return +m[1] }
const EPS = num(read('cartograph/bake-ground.js'), /const GROUND_Y_EPS\s*=\s*([\d.]+)/, 'GROUND_Y_EPS')
const FLOOR = num(read('src/lib/qualityProfile.js'), /export const TOWN_CAMERA_NEAR_M\s*=\s*([\d.]+)/, 'TOWN_CAMERA_NEAR_M')
const PROF = read('src/lib/qualityProfile.js')
const MOVIE_NEARS = { 'phone-lo': num(PROF.slice(PROF.indexOf('  phone: {')), /movieNear:\s*([\d.]+)/, 'QUALITY.phone.movieNear'),
  desktop: num(PROF.slice(PROF.indexOf('  desktop: {')), /movieNear:\s*([\d.]+)/, 'QUALITY.desktop.movieNear') }
const LEAN = num(REG, /export const PLAN_MAX_LEAN_DEG\s*=\s*([\d.]+)/, 'PLAN_MAX_LEAN_DEG')
const plan = REG.slice(REG.indexOf('  plan: {'))
const MIN_D = num(plan, /minDistance:\s*([\d.]+)/, 'REGIMES.plan.minDistance'), MAX_D = num(plan, /maxDistance:\s*([\d.]+)/, 'REGIMES.plan.maxDistance')
const FOV = num(read('src/cartograph/skyLightChannels.js'), /browse:\s*\{\s*fov:\s*([\d.]+)/, 'SHOTS_FLAT_DEFAULTS.browse.fov')
const BITS = 24   // the depth buffer a WebGL canvas with stencil gets (D24S8)

const block = (src) => { const a = src.indexOf('const _nd = new THREE.Vector3()'), b = src.indexOf('export const REGIME_LIMIT_KEYS')
  if (a < 0 || b < a) throw new Error('overheadNear block not found'); return src.slice(a, b).replace(/export function/g, 'function') }
const load = (src) => new Function('THREE', block(src) + '\nreturn overheadNear')(THREE)

function rig({ alt, leanDeg, aspect }) {
  const c = new THREE.PerspectiveCamera(FOV, aspect, FLOOR, 60500)
  c.position.set(0, alt, 0)
  c.rotation.set(-Math.PI / 2 + leanDeg * Math.PI / 180, 0, 0, 'YXZ')   // straight down, leaned toward -z
  c.updateMatrixWorld(); c.updateProjectionMatrix()
  return c
}
// The view depth of the plane y = Y along a screen point's ray (Infinity when the ray does not reach it).
const _d = new THREE.Vector3(), _w = new THREE.Vector3()
function depthAt(c, x, y, Y) {
  _d.set(x, y, -1).applyMatrix4(c.projectionMatrixInverse).normalize(); _w.copy(_d).transformDirection(c.matrixWorld)
  return _w.y < -1e-9 ? (c.position.y - Y) * _d.z / _w.y : Infinity
}
function gridMin(c, Y, N = 40) { let m = Infinity; for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) m = Math.min(m, depthAt(c, -1 + 2 * i / N, -1 + 2 * j / N, Y)); return m }
function gridMax(c, Y, N = 40) { let m = 0; for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const z = depthAt(c, -1 + 2 * i / N, -1 + 2 * j / N, Y); if (Number.isFinite(z)) m = Math.max(m, z) } return m }
const step = (z, near) => z * z / (near * 2 ** BITS)

function judge(overheadNear, town, { quiet = false } = {}) {
  const f = [], rows = []
  const alts = [MIN_D, 100, 300, 1000, 3015, 6525, 10000, 19717, MAX_D]
  for (const aspect of [390 / 844, 1.6]) for (const leanDeg of [0, LEAN]) for (const topY of [0, 77, 350]) for (const alt of alts) {
    const c = rig({ alt, leanDeg, aspect }), near = overheadNear(c, topY, FLOOR)
    const tag = `alt ${alt} lean ${leanDeg}° aspect ${aspect.toFixed(2)} top ${topY}`
    if (!(near >= FLOOR)) { f.push(`${tag}: near ${near} is under the canvas's floor ${FLOOR}`); continue }
    const zTop = gridMin(c, topY)
    if (alt <= topY) { if (near !== FLOOR) f.push(`${tag}: camera not above the top, near ${near} ≠ the floor`); continue }
    if (near > zTop * (1 + 1e-9) + 1e-9) f.push(`${tag}: near ${near.toFixed(3)} CLIPS — the top plane is ${zTop.toFixed(3)} m deep at the grid's nearest point`)
    else if (zTop > FLOOR && near < zTop * 0.99) f.push(`${tag}: near ${near.toFixed(3)} is not the top plane's corner depth ${zTop.toFixed(3)}`)
    const zc = depthAt(c, 0, 0, 0), sc = step(zc, near), sf = step(gridMax(c, 0), near)
    if (!(sc < EPS)) f.push(`${tag}: the ground under the centre steps ${(sc * 1000).toFixed(2)} mm ≥ GROUND_Y_EPS ${EPS * 1000} mm`)
    if (topY === 77) rows.push({ aspect: aspect.toFixed(2), lean: leanDeg, alt, near: +near.toFixed(1), centre_mm: +(sc * 1000).toFixed(3), farthest_mm: +(sf * 1000).toFixed(3), atNear1_centre_mm: +(step(zc, FLOOR) * 1000).toFixed(0) })
  }
  // 4. refusals
  const up = rig({ alt: 6525, leanDeg: 0, aspect: 1 }); up.rotation.set(FOV * Math.PI / 360 + 0.05, 0, 0, 'YXZ'); up.updateMatrixWorld()
  if (overheadNear(up, 0, FLOOR) !== FLOOR) f.push('a camera looking above the horizon (no corner ray down) does not take the floor')
  if (overheadNear(rig({ alt: 6525, leanDeg: 0, aspect: 1 }), NaN, FLOOR) !== FLOOR) f.push('an unknown top does not take the floor')
  // 5. TownOptics, read
  const t = town.replace(/\/\/.*$/gm, '')
  if (!/near\s*=\s*overheadNear\(\s*cam\s*,\s*d\.top\s*\+\s*terrainCeilingRaw\.value\s*\*\s*Math\.max\(\s*0\s*,\s*terrainExag\.value\s*\)\s*,\s*TOWN_CAMERA_NEAR_M\s*\)/.test(t)) f.push('Town.jsx#TownOptics does not hold near = overheadNear(cam, the drawn top + terrainCeilingRaw × the live exag, TOWN_CAMERA_NEAR_M)')
  if (!/shot\s*===\s*'plan'/.test(t.slice(t.indexOf('function TownOptics')))) f.push('TownOptics does not tie the derived near to the plan shot')
  const sky = t.match(/const SKYWARD = new Set\(\[([^\]]*)\]\)/)
  for (const g of ['town:sky', 'town:clouds']) {
    if (!sky || !sky[1].includes(`'${g}'`)) f.push(`TownOptics' drawn top does not exclude the ${g} group`)
    if (!t.includes(`name="${g}"`)) f.push(`Town draws no group named ${g} — the exclusion names nothing`)
  }
  if (!quiet) console.table(rows)
  return f
}

const base = load(REG)
const f = judge(base, TOWN, { quiet: process.argv.includes('--live') })
if (process.argv.includes('--live')) process.exit(await live(f))
if (process.argv.includes('--mutants')) {
  if (f.length) { console.log('⛔ the check is RED on the source — mutants are meaningless'); process.exit(1) }
  const swap = (a, b) => { if (!REG.includes(a)) throw new Error(`mutant anchor missing: ${a}`); return load(REG.replace(a, b)) }
  const muts = [
    ['near pinned at the floor (today\'s near 1)', () => judge(swap('return Number.isFinite(z) ? Math.max(floorM, z) : floorM', 'return floorM'), TOWN, { quiet: true })],
    ['the near edge\'s corners dropped', () => judge(swap('[[-1, -1], [1, -1], [-1, 1], [1, 1]]', '[[-1, 1], [1, 1]]'), TOWN, { quiet: true })],
    ['the centre ray only', () => judge(swap('[[-1, -1], [1, -1], [-1, 1], [1, 1]]', '[[0, 0]]'), TOWN, { quiet: true })],
    ['the floor removed', () => judge(load(REG.replace('if (!(h > floorM)) return floorM', '').replace('Math.max(floorM, z)', 'z')), TOWN, { quiet: true })],
    ['TownOptics drops the terrain ceiling', () => judge(base, TOWN.replace('d.top + terrainCeilingRaw.value * Math.max(0, terrainExag.value)', 'd.top'), { quiet: true })],
    ['TownOptics stops excluding the sky', () => judge(base, TOWN.replace("new Set(['town:sky', 'town:clouds'])", "new Set(['town:clouds'])"), { quiet: true })],
  ]
  let missed = 0
  for (const [n, run] of muts) { const r = run(); const red = r.length > 0; if (!red) missed++; console.log(`${red ? '✅ RED' : '⛔ MISSED'} — ${n}${red ? `: ${r[0].slice(0, 140)}` : ''}`) }
  process.exit(missed ? 1 : 0)
}
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.slice(0, 12).join('\n   ')}`); process.exit(1) }
console.log(`✅ the overhead near never clips the town's top, stands at its corner depth, and resolves the ground under the centre to < GROUND_Y_EPS (${EPS * 1000} mm) from ${MIN_D} m to ${MAX_D} m, straight down and leaned ${LEAN}°`)

async function live(nodeFails) {
  if (nodeFails.length) { console.log(`⛔ the node judge is RED — ${nodeFails[0]}`); return 1 }
  const { spawn } = await import('node:child_process'), fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const TOWN_ID = arg('town'), BASE = arg('base'), OUT = arg('out')
  if (!TOWN_ID || !BASE) { console.log('⛔ --live needs --town=<t> --base=<url>'); return 2 }
  if (OUT) fs.mkdirSync(OUT, { recursive: true })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const fails = []
  for (const mode of ['phone-lo', 'desktop']) {
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'overhead-near-'))
    const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--window-size=1400,1000', '--enable-gpu', 'about:blank'], { stdio: 'ignore' })
    try {
      let port; for (let i = 0; i < 100 && !port; i++) { const f = path.join(prof, 'DevToolsActivePort'); if (fs.existsSync(f)) port = fs.readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
      const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
      await new Promise((r) => { ws.onopen = r })
      let seq = 0; const pending = new Map(); let S
      const cdp = (method, params = {}, sid = S) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) }
        else if (m.method === 'Fetch.requestPaused') { const r = m.params.request; cdp(r.method !== 'GET' ? 'Fetch.failRequest' : 'Fetch.continueRequest', r.method !== 'GET' ? { requestId: m.params.requestId, errorReason: 'BlockedByClient' } : { requestId: m.params.requestId }) } }
      const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' }, null)
      S = (await cdp('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
      await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }); await cdp('Page.enable'); await cdp('Runtime.enable')
      await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.mode.v1', '${mode}'); localStorage.setItem('cartograph-last-stage-shot', 'browse')` })
      const js = async (x) => (await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value
      await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN_ID}` })
      const t0 = Date.now(); let ok = false
      while (!ok && Date.now() - t0 < 180000) { await sleep(1000); ok = await js(`performance.getEntriesByName('ward:reveal').length > 0 && !!window.__camera`) }
      if (!ok) { fails.push(`${mode}: the town never revealed in Preview`); continue }
      await sleep(8000)
      const read = () => js(`(() => { const c = window.__camera; const d = new c.position.constructor(); c.getWorldDirection(d); return { near: c.near, y: c.position.y, down: -d.y } })()`)
      const at = async (label, alt) => {
        if (alt) { await js(`(() => { const c = window.__camera, t = window.__controls?.target; if (!t) return; const k = ${alt} / c.position.y; c.position.sub(t).multiplyScalar(k).add(t); window.__controls.update() })()`); await sleep(2500) }
        const r = await read(), z = r.y / Math.max(r.down, 1e-3), st = step(z, r.near)
        const verdict = mode === 'phone-lo' ? st < EPS : true
        if (!verdict) fails.push(`${mode} ${label}: near ${r.near.toFixed(1)} at ${r.y.toFixed(0)} m — the ground steps ${(st * 1000).toFixed(2)} mm`)
        console.log(`${verdict ? '✅' : '⛔'} ${mode.padEnd(8)} ${label.padEnd(12)} altitude ${r.y.toFixed(0).padStart(6)} m · near ${r.near.toFixed(1).padStart(8)} m · linear step at the ground ${(st * 1000).toFixed(3)} mm${mode === 'desktop' ? ' (log depth: not judged)' : ''}`)
        if (OUT) { const s = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); fs.writeFileSync(path.join(OUT, `${TOWN_ID}-${mode}-${label}.jpg`), Buffer.from(s.data, 'base64')) }
        return r
      }
      const r0 = await at('browse')
      await at('3x', r0.y * 3)
      await at('max', MAX_D)
      // The other shots keep theirs: the movie the profile's movieNear, Street the canvas's (Preview's top-bar buttons).
      const MOVIE_NEAR = MOVIE_NEARS[mode]
      for (const [btn, want] of [['Hero', MOVIE_NEAR], ['Browse', 'derived'], ['Street', FLOOR]]) {   // Hero → Street is not adjacent (shots.js#SHOT_ADJACENCY)
        await js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '${btn}')?.click()`); await sleep(9000)
        const r = await read(), ok = want === 'derived' ? r.near > FLOOR && step(r.y / Math.max(r.down, 1e-3), r.near) < EPS : r.near === want
        if (!ok) fails.push(`${mode} ${btn}: near ${r.near}, want ${want}`)
        console.log(`${ok ? '✅' : '⛔'} ${mode.padEnd(8)} ${btn.padEnd(12)} near ${r.near} m (want ${want}) · camera at ${r.y.toFixed(1)} m`)
      }
      ws.close()
    } finally { try { chrome.kill('SIGKILL') } catch {} ; try { fs.rmSync(prof, { recursive: true, force: true }) } catch {} }
  }
  if (fails.length) { console.log(`\n⛔ FAIL — ${fails.length}\n   ${fails.join('\n   ')}`); return 1 }
  console.log(`\n✅ live: Preview's overhead camera on ${TOWN_ID} resolves its ground on phone-lo at Browse, 3× and maxDistance`)
  return 0
}
