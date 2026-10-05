// Headless screenshot of a Preview shot (Grain, 2026-10-04): node scratch/tree-cost/shot.mjs --town=… --shot=browse --q='treeDebug=bandTint' --out=…png
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const URL_ARG = arg('url', ''), TOWN = arg('town', 'lafayette-square'), SHOT = arg('shot', 'browse'), Q = arg('q', ''), OUT = arg('out', '/tmp/shot.png'), EVAL = arg('eval', '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'tree-cost-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(1) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map(); const errs = []
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled' && /error|warning/.test(m.params.type)) errs.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 240)) }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('preview.mode.v1', 'desktop'); localStorage.setItem('cartograph-last-stage-shot', '${SHOT}')${arg('init', '') ? '; ' + arg('init', '') : ''}` }, S)
await cdp('Page.navigate', { url: URL_ARG || `http://localhost:5173/preview.html?look=${TOWN}${Q ? '&' + Q : ''}` }, S)
await sleep(22000)
if (EVAL) { const r = await cdp('Runtime.evaluate', { expression: EVAL, returnByValue: true, awaitPromise: true }, S); console.log('eval:', JSON.stringify(r.result?.value ?? r.exceptionDetails?.exception?.description)) }
const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, S)
writeFileSync(OUT, Buffer.from(data, 'base64'))
for (const e of [...new Set(errs)].filter((x) => /SHADER DID NOT LINK|VALIDATE|WebGL/i.test(x))) console.log('⛔ console:', e)
console.log('wrote', OUT); ws.close(); cleanup(); process.exit(0)
