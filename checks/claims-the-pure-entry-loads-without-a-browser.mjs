#!/usr/bin/env node
/**
 * THE KIT'S RENDERER-FREE DOOR LOADS WITHOUT A BROWSER (claim ② of claims-the-pure-entry-loads-no-renderer; live because
 * vite is, Zob 2026-11-02).
 *
 * An app's 2D module is loaded, in its checks, as vite SSR loads it (the Ward's happening-has-a-place: createServer with
 * appType 'custom', never listening, then ssrLoadModule): import.meta.env is present, window / document / WebGL are not. The
 * entry, src/components/TownPure.js, must load there. A utility that touches a browser global at load throws here even
 * when the static check finds no renderer in its graph. No port is opened; the server is closed after.
 * Usage: node checks/claims-the-pure-entry-loads-without-a-browser.mjs [--mutants]
 *   --mutants: the entry with a browser global touched at load → RED.
 */
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY_REL = 'src/components/TownPure.js'

async function loads(extra = '') {
  const plugins = extra ? [{ name: 'zob-mutant', transform(code, id) { return id.endsWith('/' + ENTRY_REL) ? code + '\n' + extra : null } }] : []
  const vite = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'silent', plugins,
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  try { const m = await vite.ssrLoadModule('/' + ENTRY_REL); return Object.keys(m).length ? [] : [`${ENTRY_REL} loads with no exports`] }
  catch (e) { return [`${ENTRY_REL} does not load without a browser (vite SSR, no window): ${String(e.message).split('\n')[0]}`] }
  finally { await vite.close() }
}

if (!existsSync(resolve(ROOT, ENTRY_REL))) { console.log(`⛔ no ${ENTRY_REL}: the kit has no renderer-free door yet`); process.exit(1) }
const fails = await loads()
if (fails.length) { console.log('⛔ ' + fails.join('\n⛔ ')); process.exitCode = 1 }
else console.log(`✅ ${ENTRY_REL} loads as an app's 2D module is loaded (vite SSR, no window)`)
if (process.argv.includes('--mutants')) {
  for (const [name, extra] of [['the entry touches a browser global at load', 'void window.devicePixelRatio']]) {
    const n = (await loads(extra)).length
    console.log(`${n ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`)
    if (!n) process.exitCode = 1
  }
}
