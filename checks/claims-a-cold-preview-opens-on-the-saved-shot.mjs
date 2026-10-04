#!/usr/bin/env node
// claims-a-cold-preview-opens-on-the-saved-shot.mjs — DOES PREVIEW OPEN, COLD, ON WHATEVER SHOT STAGE LAST LEFT?
//
// Preview opens on Stage's last shot (localStorage cartograph-last-stage-shot). Its Street eye stands at
// shots.js#streetStandOf, which is null until the town's disc is published — and a cold load into Street threw
// "shot=street needs streetAt" and left a dead canvas (Grain, 2026-10-04; regression from 03134460). For each saved
// shot, a fresh browser loads Preview and must land on that shot's Town shot with no streetAt error.
// Needs the running kit at :5173 (no new server). ⛔ READ-ONLY.
//   node checks/claims-a-cold-preview-opens-on-the-saved-shot.mjs [town]   (default huron)
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = 'http://localhost:5173', TOWN = process.argv[2] || 'huron'
const SHOTS = { hero: 'movie', browse: 'plan', street: 'street' }
let failed = 0
for (const [saved, want] of Object.entries(SHOTS)) {
const profile = mkdtempSync(join(tmpdir(), 'street-cold-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-swiftshader', '--window-size=1280,800'], { stdio: ['ignore', 'ignore', 'pipe'] })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
const hard = setTimeout(() => { console.log('TIMEOUT'); cleanup(); process.exit(2) }, 120000)
try {
  const port = await new Promise((res) => chrome.stderr.on('data', (d) => { const m = String(d).match(/127\.0\.0\.1:(\d+)/); if (m) res(m[1]) }))
  const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let seq = 0; const pending = new Map(); const errors = []
  const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '))
  }
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
  const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S)).result?.value
  await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
  await new Promise(r => setTimeout(r, 3000))
  await js(`localStorage.setItem('cartograph-last-stage-shot', '${saved}'); true`)
  await cdp('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` }, S)
  let f = null
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000))
    f = await js(`window.__flight?.current ? JSON.stringify(window.__flight.current) : null`)
    if (f && JSON.parse(f).to === want && JSON.parse(f).landed) break
  }
  const streetErr = errors.filter(e => /streetAt/.test(e || ''))
  const ok = !streetErr.length && f && JSON.parse(f).to === want && JSON.parse(f).landed
  console.log(`${ok ? '✅' : '⛔'} saved ${saved.padEnd(6)} → ${f ? JSON.parse(f).to : 'no flight'}${streetErr.length ? ' · ' + streetErr[0] : ''}`)
  if (!ok) failed++
  ws.close(); clearTimeout(hard); cleanup()
} catch (e) { console.log('ERROR', e.message); clearTimeout(hard); cleanup(); process.exit(3) }
}
console.log(failed ? `⛔ ${failed} saved shot(s) do not open` : '✅ Preview opens cold on every saved shot')
process.exit(failed ? 1 : 0)
