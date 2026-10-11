// One headless look at /street-furniture?asset=<id>: does the model render, does a click select a piece, any page errors.
//   node scratch/street-furniture/render-probe.mjs [--asset=traffic_light_3] [--out=<png>]
// The CDP pattern is scratch/tree-cost/probe.mjs's (profile-path kill so no orphan browsers).
import { spawn, execSync } from 'child_process'
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const ASSET = arg('asset', 'traffic_light_3'), OUT = arg('out', join(tmpdir(), `sf-${ASSET}.png`))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'sf-render-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', e => { console.error(e); cleanup(); process.exit(1) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map(), errors = []
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('ERR ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300)) }
try {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
  const js = async expr => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true }, S)).result?.value
  await cdp('Page.navigate', { url: `http://localhost:5173/street-furniture?asset=${ASSET}` }, S)
  let ok = false
  for (let i = 0; i < 60 && !ok; i++) { await sleep(500); ok = await js(`!!document.querySelector('canvas') && document.body.innerText.includes('${ASSET}')`) }
  await sleep(2500)
  const rect = await js(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })()`)
  // Click a column of points down the middle of the canvas until one lands on a piece.
  let picked = null
  for (let f = 0.2; f <= 0.8 && !picked; f += 0.05) {
    const x = rect[0] + rect[2] / 2, y = rect[1] + rect[3] * f
    for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, S)
    await sleep(150)
    picked = await js(`(document.body.innerText.match(/\\bSG\\d*#\\d+ · \\d+ tris/) || [null])[0]`)
  }
  const shot = await cdp('Page.captureScreenshot', { format: 'png' }, S)
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log(JSON.stringify({ asset: ASSET, canvas: ok, picked, errors, screenshot: OUT }, null, 1))
} finally { cleanup() }
