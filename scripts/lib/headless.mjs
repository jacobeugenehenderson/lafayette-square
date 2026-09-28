/**
 * headless.mjs — one headless Chrome over the DevTools protocol (node's own WebSocket; no dependency).
 * Shared by scripts/legibility-report.mjs and scripts/lib/read-page.mjs.
 *
 * ⛔ A throwaway profile under the OS temp dir, killed and removed by close() (and on exit) — never anyone's own
 *    Chrome, never a server: pages come from a dev server that is already running.
 *
 *   const chrome = await launch()
 *   const page = await chrome.openPage()          // { sessionId, send(method, params), on(event, fn), close() }
 *   …
 *   await chrome.close()
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch({ windowSize = '900,1000' } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'headless-chrome-'))
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', `--window-size=${windowSize}`, '--enable-gpu', 'about:blank'], { stdio: 'ignore' })
  let closed = false
  const kill = () => {
    if (closed) return
    closed = true
    try { chrome.kill('SIGKILL') } catch {}
    try { rmSync(profile, { recursive: true, force: true }) } catch {}
  }
  process.on('exit', kill)

  let port = null
  for (let i = 0; i < 100 && !port; i++) {
    const f = join(profile, 'DevToolsActivePort')
    if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]
    else await sleep(100)
  }
  if (!port) { kill(); throw new Error('headless Chrome did not start') }
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  const ws = new WebSocket(webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })

  let seq = 0
  const pending = new Map()
  const listeners = new Set()          // (message) => void, for protocol events
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    else if (m.method) for (const fn of listeners) fn(m)
  }
  const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

  async function openPage() {
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
    const mine = new Set()
    return {
      sessionId,
      send: (method, params) => cdp(method, params, sessionId),
      on(event, fn) {
        const l = (m) => { if (m.sessionId === sessionId && m.method === event) fn(m.params) }
        listeners.add(l); mine.add(l)
        return () => { listeners.delete(l); mine.delete(l) }
      },
      async close() {
        for (const l of mine) listeners.delete(l)
        await cdp('Target.closeTarget', { targetId }).catch(() => {})
      },
    }
  }

  return {
    cdp, openPage,
    async close() { try { ws.close() } catch {} ; kill() },
  }
}
