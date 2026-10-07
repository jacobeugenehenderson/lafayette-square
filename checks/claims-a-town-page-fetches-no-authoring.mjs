#!/usr/bin/env node
/**
 * "DOES A PAGE THAT DRAWS A TOWN TOUCH THE AUTHORING API?"
 *
 * WHY (Quire, 2026-09-28: `[skeleton] load failed: SyntaxError: Unexpected token '<'` on every Ward page load).
 * Measured: the authoring store (src/cartograph/stores/useCartographStore.js) ran its whole load at MODULE SCOPE
 * under any dev server — the skeleton, centerlines, overlay, markers, measurements, the Looks and a Look's design —
 * because renderer label pieces imported it. A Town page made 15 /api/cartograph requests, for LAFAYETTE SQUARE's
 * skeleton while drawing huron. The player reads the slab and the manifest; the authoring API is Stage's.
 *
 * RUNTIME: headless Chrome, a throwaway profile, against the running dev server; pages that mount <Town> and are not
 * authoring apps — the old player at / and the legibility harness (which mounts <Town> alone). Asserts 0 requests
 * to /api/cartograph/*, and names each one with the stack that started it. ▶ the static half:
 * node checks/claims-the-town-reads-no-player-store.mjs (no renderer file reaches src/cartograph/stores/*).
 *
 * Usage: node checks/claims-a-town-page-fetches-no-authoring.mjs --look=<town>
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requiredTown } from './_scenes.mjs'
const BASE = 'http://localhost:5173'
const look = requiredTown('look')
const PAGES = [['the player', `/?look=${look}`], ['the legibility harness (<Town> alone)', `/legibility.html?look=${look}&at=noon`]]
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'no-authoring-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup)
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map(); const hits = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })) })
const frames = (st) => { const out = []; for (let s = st; s; s = s.parent) for (const f of s.callFrames) if (/\/src\//.test(f.url)) out.push(`${f.functionName || '(anon)'} @ ${f.url.replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '')}:${f.lineNumber + 1}`); return out }
ws.onmessage = (e) => { const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return }
  if (m.method === 'Network.requestWillBeSent' && /\/api\/cartograph\//.test(m.params.request.url)) hits.get(m.sessionId)?.push({ url: m.params.request.url.replace(/^https?:\/\/[^/]+/, ''), from: frames(m.params.initiator?.stack).slice(0, 4) }) }
let failed = 0
for (const [name, path] of PAGES) {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  hits.set(S, [])
  await cdp('Network.enable', {}, S); await cdp('Debugger.enable', {}, S); await cdp('Debugger.setAsyncCallStackDepth', { maxDepth: 32 }, S)
  await cdp('Page.enable', {}, S); await cdp('Page.navigate', { url: BASE + path }, S)
  await sleep(25000)
  const h = hits.get(S)
  if (h.length) { failed++; console.log(`⛔ ${name} (${path}): ${h.length} authoring request(s)`); for (const x of h.slice(0, 6)) console.log(`     ${x.url}\n        ← ${x.from.join('\n        ← ')}`) }
  else console.log(`✅ ${name} (${path}): 0 authoring requests`)
  await cdp('Target.closeTarget', { targetId })
}
ws.close(); cleanup()
if (failed) { console.log(`\n⛔ FAIL — a page that draws a town reached the authoring API`); process.exit(1) }
console.log('\n✅ a page that draws a town touches no authoring endpoint')
process.exit(0)
