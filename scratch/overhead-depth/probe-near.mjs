// Does the overhead camera's NEAR plane decide the phone's sand-over-water? Read-only, headless, phone-emulated (iPhone UA,
// 390×844 @3 → the player takes phone-lo: linear depth). Loads --url, goes to each --views path, reads window.__camera
// (ShaderLinkGuard's handle), then sets camera.near through --nears and screenshots each. Nothing is written to any server.
// Usage: node scratch/overhead-depth/probe-near.mjs --url=https://provincetown.online/ --views=/browse,/society --nears=1,100,auto --out=<dir> [--desktop]
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const URL_ = arg('url'), OUT = arg('out'), TAG = arg('tag', 'p'), DESK = process.argv.includes('--desktop')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'near-probe-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1400,1000', '--enable-gpu', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {}; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {}; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup)
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let seq = 0; const pending = new Map(); const logs = []
const cdp = (method, params = {}, sid) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) } else if (m.method === 'Runtime.consoleAPICalled' && /error/.test(m.params.type)) logs.push(m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 160)) }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
if (!DESK) {
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }, S)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, S)
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, S)
} else await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false }, S)
const js = async (x) => (await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, S))?.result?.value
const t0 = Date.now()
if (arg('shift')) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const D = Date, off = ${+arg('shift')} * 3600e3; class S extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off) } static now() { return D.now() + off } }; window.Date = S })()` }, S)
await cdp('Page.navigate', { url: URL_ }, S)
let done = false
while (!done && Date.now() - t0 < 180000) { await sleep(500); done = await js("performance.getEntriesByName('ward:first-truthful-frame').length > 0") }
if (!done) { console.log('⛔ never revealed', logs.slice(0, 5)); process.exit(2) }
await sleep(5000)
const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, S); writeFileSync(join(OUT, name + '.jpg'), Buffer.from(r.data, 'base64')) }
const cam = () => js(`(() => { const c = window.__camera, g = window.__scene && (() => { let gl = null; return null })(); if (!c) return null
  const d = new c.position.constructor(); c.getWorldDirection(d)
  return { near: c.near, far: c.far, fov: c.fov, aspect: +c.aspect.toFixed(3), y: +c.position.y.toFixed(1), down: +(-d.y).toFixed(4), logDepth: !!window.__glLogDepth } })()`)
// The renderer's depth mode, read off a drawn material's program (three compiles USE_LOGDEPTHBUF into it when log depth is on).
const depthMode = () => js(`(() => { const s = window.__scene; let m = null; s?.traverse(o => { if (!m && o.isMesh && o.material?.program) m = o.material }); return m ? null : null })()`)
// The highest drawn point under the camera: the scene's world box, every visible mesh (instanced included), skipping the sky dome.
const top = () => js(`(() => { const s = window.__scene, c = window.__camera; if (!s) return null; let ymax = -Infinity, who = null
  const B = new (s.position.constructor === undefined ? Object : Object)(); 
  s.traverse(o => { if (!o.visible || !(o.isMesh || o.isPoints || o.isSprite || o.isLine)) return; let p = o; while (p) { if (!p.visible) return; p = p.parent }
    const g = o.geometry; if (!g) return; if (!g.boundingBox) try { g.computeBoundingBox() } catch { return }
    if (!g.boundingBox || !isFinite(g.boundingBox.max.y)) return
    o.updateWorldMatrix(true, false)
    let y
    if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox?.(); const bb = o.boundingBox || g.boundingBox; y = bb.clone().applyMatrix4(o.matrixWorld).max.y }
    else y = g.boundingBox.clone().applyMatrix4(o.matrixWorld).max.y
    if (y > 20000) return
    if (y > ymax) { ymax = y; who = (o.name || o.type) + ' < ' + (o.parent?.name || o.parent?.type || '') }
  }); return { ymax: +ymax.toFixed(1), who, camY: +c.position.y.toFixed(1) } })()`)
const res = []
for (const view of (arg('views', '') || '.').split(',').filter(Boolean)) {
  if (view !== '.') { await js(`history.pushState({}, '', '${view}'); dispatchEvent(new PopStateEvent('popstate'))`); await sleep(9000) }
  const c0 = await cam(), t = await top()
  console.log('walk', JSON.stringify(await js(`(() => { const s = window.__scene; let n = 0, d = 0; const t0 = performance.now(); for (let k = 0; k < 20; k++) s.traverse(o => { n++; if (o.isMesh || o.isPoints || o.isSprite || o.isLine) d++ }); return { nodes: n / 20, drawables: d / 20, msPerWalk: +((performance.now() - t0) / 20).toFixed(3) } })()`)))
  const name = view === '.' ? new URL(URL_).pathname.replace(/\W+/g, '') || 'root' : view.replace(/\W+/g, '') || 'root'
  console.log(`${view}: camera`, JSON.stringify(c0), 'top', JSON.stringify(t))
  for (const n of arg('nears', '1').split(',')) {
    const near = n === 'auto' ? Math.max(1, (c0.y - t.ymax) * 0.9) : +n
    await js(`(() => { const c = window.__camera; c.near = ${near}; c.updateProjectionMatrix(); window.__nearHold = ${near} })()`)
    // hold it each frame in case something resets it
    await js(`(() => { if (window.__nearLoop) return; window.__nearLoop = 1; const f = () => { const c = window.__camera; if (c && window.__nearHold && c.near !== window.__nearHold) { c.near = window.__nearHold; c.updateProjectionMatrix() } requestAnimationFrame(f) }; f() })()`)
    await sleep(2500)
    const z = c0.y / Math.max(c0.down, 1e-3)
    const step = (z * z) / (near * 2 ** 24)
    await shot(`${TAG}-${name}-near${Math.round(near)}`)
    res.push({ view, near: +near.toFixed(1), viewZ: +z.toFixed(0), linearStep24_m: +step.toPrecision(3), shot: `${TAG}-${name}-near${Math.round(near)}.jpg` })
    console.log('  near', near.toFixed(1), '→ linear 24-bit step at the ground', step.toPrecision(3), 'm')
  }
  await js(`window.__nearHold = 0`)
}
writeFileSync(join(OUT, TAG + '.json'), JSON.stringify({ res, logs: logs.slice(0, 20) }, null, 1))
ws.close(); cleanup(); process.exit(0)
