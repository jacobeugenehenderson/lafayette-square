#!/usr/bin/env node
/**
 * "DOES THE FLIGHT INTO BROWSE BUILD ANY AO?"
 *
 * WHY (BRIEF-ward-browse-noon-and-the-far-trees §3.1, Meridian 2026-10-14). The hang into Browse on desktop was N8AO
 * rebuilding at the shot change: the AO pass ran full-res in the movie and half-res elsewhere, and a halfRes change makes
 * N8AO build its AO, compositor and depth-downsample materials anew — four programs linked synchronously in the flight's
 * first frames (getProgramInfoLog ~420 ms on huron; staging, Ward 486b83d / kit 926ac3a4). Jacob's ruling: half-res
 * everywhere, so nothing is left to rebuild.
 *
 * Asserts, on the running app (Preview, desktop profile, the movie shot): after the town is revealed and settled, a
 * switch to Browse links NO program whose fragment source is N8AO's (read off the GL context, never off a name).
 * Discloses every OTHER program the switch links, by its source's tail, so a new class of hitch is said, not hidden.
 *
 * ⛔ READ-ONLY (page memory only). Usage: node checks/claims-the-flight-builds-no-ao.mjs [--town=huron] [--base=http://localhost:5173]
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const TOWN = arg('town', 'huron'), BASE = arg('base', 'http://localhost:5173')
// N8AO's fragment shaders, by what only they say (n8ao/dist/N8AO.js): the AO pass, the Poisson denoise, the compositor,
// the half-res depth downsample.
const N8AO_SIGNS = [/FSAMPLES/, /poissonDisk\[/, /downsampledDepth/, /\bgNormal\b/]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'flight-ao-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1512,982', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {}; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {}; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
const fail = (msg) => { console.log(`RED  ${msg}`); cleanup(); process.exit(1) }
process.on('uncaughtException', (e) => fail(`threw: ${e.message}`))
process.on('unhandledRejection', (e) => fail(`threw: ${e?.message || e}`))

let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Emulation.setDeviceMetricsOverride', { width: 1512, height: 982, deviceScaleFactor: 2, mobile: false }, S)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('preview.mode.v1','desktop'); localStorage.setItem('cartograph-last-stage-shot','hero'); localStorage.removeItem('preview.layers.v3')" }, S)
const js = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value }
await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
let revealed = false
for (let i = 0; i < 1200 && !revealed; i++) { await sleep(100); revealed = await js("performance.getEntriesByName('ward:reveal').length > 0").catch(() => false) }
if (!revealed) fail(`${TOWN}: the town never revealed at ${BASE} — the check saw nothing`)
await sleep(5000)

// Every live program, by id, with its fragment source read off the GL context.
const programs = `(() => { const r = window.__previewGl, g = r.getContext(); return (r.info.programs || []).map(p => {
  const fs = (g.getAttachedShaders(p.program) || []).map(x => g.getShaderSource(x)).find(t => !/gl_Position/.test(t)) || ''
  return { id: p.id, fs: fs.replace(/\\s+/g, ' ') } }) })()`
const before = await js(programs)
const shot = await js(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Browse'); if (!b) return false; b.click(); return true })()`)
if (!shot) fail(`${TOWN}: Preview shows no "Browse" shot control — the check could not fly`)
await sleep(6000)
// The town's own report of the flight (Town's flightRef, which Preview hangs on window.__flight): it must have gone to the plan.
const flew = await js(`(() => { const f = window.__flight?.current; return f ? { to: f.to, from: f.from, eased: f.eased } : null })()`)
if (flew?.to !== 'plan') fail(`${TOWN}: the town reports no flight to the plan after the switch (${JSON.stringify(flew)}) — the check did not fly`)
const after = await js(programs)
const had = new Set(before.map((p) => p.id))
const fresh = after.filter((p) => !had.has(p.id))
const ao = fresh.filter((p) => N8AO_SIGNS.some((re) => re.test(p.fs)))
const others = fresh.filter((p) => !ao.includes(p))
for (const p of others) console.log(`  · the switch also linked program #${p.id}: …${p.fs.slice(-140)}`)
if (ao.length) fail(`${TOWN}: the flight into Browse linked ${ao.length} N8AO program(s) (#${ao.map((p) => p.id).join(', #')}) — the AO pass rebuilt at the shot change`)
console.log(`GREEN  ${TOWN}: the flight into Browse linked no N8AO program (${before.length} → ${after.length} programs; ${others.length} other new, listed above)`)
cleanup(); process.exit(0)
