// thin CDP harness, copied from scratch/frame-timeline/ward-prod-probe.mjs's launcher
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export async function launch({ W = 1512, H = 982, DPR = 2 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'balsa-'))
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', `--window-size=${W},${H}`, `--force-device-scale-factor=${DPR}`, 'about:blank'], { stdio: 'ignore' })
  const cleanup = () => { try { chrome.kill('SIGKILL') } catch {}; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {}; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
  let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
  const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
  await new Promise((r) => { ws.onopen = r })
  let seq = 0; const pending = new Map(); const listeners = []
  const cdp = (method, params = {}, sid) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? { error: m.error }); pending.delete(m.id) } else for (const l of listeners) l(m) }
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  const js = async (x) => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, S); if (r?.exceptionDetails) return { EXC: r.exceptionDetails.exception?.description || r.exceptionDetails.text }; return r?.result?.value }
  return { cdp: (m, p) => cdp(m, p, S), js, on: (f) => listeners.push(f), close: () => { ws.close(); cleanup() } }
}
