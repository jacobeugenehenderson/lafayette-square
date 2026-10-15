#!/usr/bin/env node
/**
 * "DOES THE TOWER LIGHT LOAD ON ITS FIRST TAP, AND NEVER BEFORE?"
 *
 * WHY (BRIEF-ward-browse-noon-and-the-far-trees; Jacob, 2026-10-14: "the lamp is totally last place … only prompted
 * manually with the lamp; and even then some pause is justified"). TowerLight.jsx is a light over the map with its own
 * crisp shadows. Its programs cost seconds to compile (measured 1.8 + 2.4 s on huron, synchronous), so nothing of it may
 * exist before the reader asks; the first ask may pause (said, measured); every later toggle must link nothing.
 *
 * Asserts, on a running Preview (the plan shot; --mode=desktop | phone), through Preview's probe (setTowerLight):
 *   · before the first ask there is no Tower Light in the scene;
 *   · the first ask reports 'warming' then 'on', and the light is then in the scene, lit, over the ground under the middle
 *     of the screen (the plan controls' target), its shadow CRISP (its own radius, never the PCSS stamp);
 *   · off, then on, three times: no program is linked, and off means dark.
 * Discloses (never gates): the first ask's pause (ms to 'on') and its long frames (over two measured frames).
 *
 * ⛔ READ-ONLY (page memory only). Usage: node checks/claims-the-tower-light-loads-on-its-first-tap.mjs [--town=huron] [--mode=desktop|phone] [--base=http://localhost:5173]
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const TOWN = arg('town', 'huron'), BASE = arg('base', 'http://localhost:5173'), MODE = arg('mode', 'desktop')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = [], said = []
const profile = mkdtempSync(join(tmpdir(), 'tower-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {}; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {}; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
const done = () => {
  console.log(`${problems.length ? 'RED  ' : 'GREEN'}  ${TOWN} ${MODE}: the Tower Light loads on its first tap and never before; later toggles link nothing`)
  for (const p of problems) console.log(`  ✗ ${p}`)
  for (const s of said) console.log(`  · ${s}`)
  cleanup(); process.exit(problems.length ? 1 : 0)
}
process.on('uncaughtException', (e) => { problems.push(`threw: ${e.message}`); done() })
process.on('unhandledRejection', (e) => { problems.push(`threw: ${e?.message || e}`); done() })

let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.mode.v1','${MODE === 'phone' ? 'phone-hi' : 'desktop'}'); localStorage.setItem('cartograph-last-stage-shot','browse'); localStorage.removeItem('preview.layers.v3')` }, S)
const js = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value }
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
let ready = false
for (let i = 0; i < 1200 && !ready; i++) { await sleep(100); ready = await js("performance.getEntriesByName('ward:reveal').length > 0 && !!window.__townProbe?.setTowerLight && !!window.__flight?.current?.landed").catch(() => false) }
if (!ready) { problems.push(`the town never revealed in the plan at ${BASE}, or Preview has no setTowerLight — nothing was checked`); done() }
await sleep(3000)

const find = `(() => { let s = null; window.__previewScene.traverse((o) => { if (o.name === 'town:towerLight') s = o }); return s })()`
const programs = `window.__previewGl.info.programs.map((p) => p.id)`
if (await js(`!!${find}`)) problems.push('a Tower Light is in the scene before anyone asked for it')

// The first ask: its pause and its long frames (over two measured frames), disclosed.
const first = await js(`(async () => {
  const frames = (ms) => new Promise((done) => { const d = []; let last = 0; const t0 = performance.now()
    const f = (t) => { if (last) d.push(t - last); last = t; if (performance.now() - t0 < ms) requestAnimationFrame(f); else done(d) }; requestAnimationFrame(f) })
  const rest = (await frames(1500)).sort((a, b) => a - b), iv = rest[rest.length >> 1]
  const seen = []; let last = 0, go = true; const d = []
  const f = (t) => { if (last) d.push(t - last); last = t; const s = window.__towerLight?.state; if (s && seen.at(-1) !== s) seen.push(s); if (go) requestAnimationFrame(f) }
  requestAnimationFrame(f)
  const t0 = performance.now(); window.__townProbe.setTowerLight(true)
  while (window.__towerLight?.state !== 'on' && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 20))
  const ms = Math.round(performance.now() - t0); await new Promise((r) => setTimeout(r, 500)); go = false
  return { ms, seen, iv: Math.round(iv * 10) / 10, long: d.filter((x) => x > 2 * iv).map(Math.round) }
})()`)
if (first.seen[0] !== 'warming' || !first.seen.includes('on')) problems.push(`the first ask reported ${JSON.stringify(first.seen)} (want 'warming' then 'on')`)
said.push(`first ask: ${first.ms} ms to 'on' · long frames (> ${Math.round(2 * first.iv)} ms): ${first.long.length ? first.long.join(', ') : 'none'}`)

const lit = await js(`(() => { const s = ${find}; const ctl = window.__previewScene.__r3f.root.getState().controls
  return s && { visible: s.visible, intensity: s.intensity, radius: s.shadow.radius, shadows: window.__previewGl.shadowMap.enabled,
    dx: ctl ? Math.hypot(s.position.x - ctl.target.x, s.position.z - ctl.target.z) : null } })()`)
if (!lit) problems.push('after the first ask there is no Tower Light in the scene')
else {
  if (!lit.visible || !(lit.intensity > 0)) problems.push(`on, the Tower Light is not lit (visible ${lit.visible}, intensity ${lit.intensity})`)
  if (!(lit.radius < 256)) problems.push(`its shadow reads the PCSS stamp (radius ${lit.radius}) — not crisp`)
  if (lit.dx == null || lit.dx > 1) problems.push(`it does not stand over the ground under the middle of the screen (${lit.dx?.toFixed(1)} m off the controls' target)`)
  said.push(`lit: intensity ${lit.intensity.toFixed(2)}, own shadow radius ${lit.radius}, shadow map ${lit.shadows ? 'on' : 'off (this profile casts nothing)'}`)
}
// Later toggles: nothing links; off is dark.
const p1 = new Set(await js(programs))
for (let i = 0; i < 3; i++) {
  await js('window.__townProbe.setTowerLight(false)'); await sleep(400)
  if (await js(`${find}?.visible`)) problems.push(`toggle ${i + 1}: off, the Tower Light is still shown`)
  await js('window.__townProbe.setTowerLight(true)'); await sleep(400)
}
const fresh = (await js(programs)).filter((id) => !p1.has(id))
if (fresh.length) problems.push(`later toggles linked ${fresh.length} program(s) (#${fresh.join(', #')}) — a toggle must only move intensity`)
done()
