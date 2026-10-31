#!/usr/bin/env node
/**
 * "DOES ANY PAGE THE BUILD MAKES IMPORT A MODULE THAT ONLY EXISTS IN DEV — AND DO THE OPERATOR APPS STILL GET THEIR
 *  DEV PREAMBLE FROM VITE?"
 *
 * WHY (2026-10-30). The five operator pages hand-inlined Vite's React Refresh preamble
 * (`import RefreshRuntime from '/@react-refresh'`), because vite.config.js#serveHelperApps served them raw, past
 * transformIndexHtml. `vite build` then resolved '/@react-refresh' and bundled the dev runtime into the published
 * player as assets/@react-refresh-*.js. The fix sends those pages through transformIndexHtml, so plugin-react injects
 * its own preamble in dev and nothing in the source names a dev-only module.
 *   ① THE PAGES the build makes are read from vite.config.js's own build.rollupOptions.input (the config loaded for
 *     `build`, `production`), never a list. None may name a dev-only specifier: /@react-refresh, /@vite/, /@id/, /@fs/.
 *   ② DEV STILL WORKS: Vite in middleware mode, on a throwaway localhost port, serves each operator page (/<input>)
 *     and Stage's /stage/<town>/<shot> through the config's own middleware. Each must carry plugin-react's preamble
 *     and the kit base declared exactly once.
 * `--mutants`: each edit below must turn this RED. ⛔ READ-ONLY: a page's mutant is its text in memory; the config's, a temp
 * file by checks/_sourceFile.mjs (Vite reads a config by path); never a copy beside the source (the one-loader ruling).
 *
 * Usage: node checks/claims-a-built-page-imports-no-dev-module.mjs [--mutants]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sourceFile } from './_sourceFile.mjs'
import { createServer as httpServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const { loadConfigFromFile, createServer } = await import('vite')
const P = { config: join(ROOT, 'vite.config.js'), pages: {} }
const DEV_ONLY = /["'`](\/@react-refresh|\/@vite\/|\/@id\/|\/@fs\/)/

async function inputsOf(configFile) {
  const { config } = await loadConfigFromFile({ command: 'build', mode: 'production' }, configFile, ROOT, 'silent')
  const input = config.build?.rollupOptions?.input
  if (!input || typeof input !== 'object') throw new Error(`${configFile} names no build.rollupOptions.input`)
  return input   // { key: 'page.html' }
}

async function run(paths) {
  const fails = []
  const input = await inputsOf(paths.config)
  // ── ① ──
  for (const [key, page] of Object.entries(input)) {
    const src = paths.pages[page] ?? readFileSync(join(ROOT, page), 'utf8')   // a mutant's page is its text
    const m = src.match(DEV_ONLY)
    if (m) fails.push(`① ${page} (build input "${key}") names ${m[1]} — a dev-only module, which \`vite build\` bundles into the published player`)
  }
  // ── ② ──
  // HMR stays ON (plugin-react injects no preamble when it is off), attached to this throwaway server: no other port.
  const http = httpServer()
  const vite = await createServer({ configFile: paths.config, root: ROOT, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, hmr: { server: http }, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  http.on('request', vite.middlewares)
  await new Promise((ok) => http.listen(0, '127.0.0.1', ok))
  try {
    const base = `http://127.0.0.1:${http.address().port}`
    const urls = [...Object.keys(input).filter((k) => input[k] !== 'index.html').map((k) => `/${k}`), '/stage/fx/hero']
    for (const u of urls) {
      const r = await fetch(base + u)
      const html = await r.text()
      if (r.status !== 200) { fails.push(`② ${u} answered ${r.status} in dev`); continue }
      if (!html.includes('/@react-refresh') || !html.includes('injectIntoGlobalHook')) fails.push(`② ${u} has no React Refresh preamble in dev — the page was served past transformIndexHtml`)
      const kit = (html.match(/<meta name="ward-kit-base"/g) || []).length
      if (kit !== 1) fails.push(`② ${u} declares the kit base ${kit} times in dev (want 1)`)
    }
  } finally { http.closeAllConnections(); http.close(); await vite.close() }
  return fails
}

const PREAMBLE = `    <script type="module">\n      import RefreshRuntime from '/@react-refresh'\n      RefreshRuntime.injectIntoGlobalHook(window)\n    </script>\n`
const MUTANTS = [
  ['the player page inlines the dev preamble', 'index.html', '</body>', PREAMBLE + '</body>'],
  ['an operator page inlines the dev preamble again', 'cartograph.html', '</body>', PREAMBLE + '</body>'],
  ['an operator page served raw (past transformIndexHtml)', 'config', 'return send(req, res, next, r.file)',
    "{ res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(withKitBase(fs.readFileSync(path.resolve(r.file), 'utf-8'), server.config.base)) }"],
  ['Stage served raw', 'config', "return send(req, res, next, 'cartograph.html')",
    "{ res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(fs.readFileSync(path.resolve('cartograph.html'), 'utf-8')) }"],
]

// a mutant: a page's text edited in memory, or the config edited into a temp file Vite can read by path
const mutated = (which, edit) => which === 'config'
  ? { ...P, config: sourceFile('vite.config.js', { transform: edit }) }
  : { ...P, pages: { [which]: edit(readFileSync(join(ROOT, which), 'utf8')) } }

const fails = await run(P)
if (fails.length) { console.error(`⛔ a built page names a dev-only module, or dev lost its preamble:\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log('✅ no built page names a dev-only module; every operator page and Stage get React Refresh from Vite in dev, kit base once')

if (process.argv.includes('--mutants')) {
  let alive = 0
  // ⛔ the controls: a no-op edit through each in-memory path (a page's text; the config as a temp file) must read GREEN
  for (const which of ['index.html', 'config']) {
    const f = await run(mutated(which, (s) => s))
    if (f.length) { console.error(`⛔ the in-memory ${which} fails unmutated — the mutants prove nothing:\n   ${f.join('\n   ')}`); process.exit(1) }
  }
  for (const [name, which, from, to] of MUTANTS) {
    const src = readFileSync(which === 'config' ? P.config : join(ROOT, which), 'utf8')
    if (!src.includes(from)) { console.error(`⛔ mutant "${name}": its target text is gone from ${which} — re-aim it`); alive++; continue }
    let red, threw = ''
    try { red = (await run(mutated(which, (s) => s.replace(from, to)))).length > 0 } catch (e) { red = true; threw = ` (by throwing: ${e.message.slice(0, 80)})` }
    console.log(`   ${red ? 'RED  ' : 'ALIVE'} ${name}${threw}`)
    if (!red) alive++
  }
  if (alive) { console.error(`⛔ ${alive} mutant(s) survived — the check cannot see that edit`); process.exit(1) }
  console.log(`✅ all ${MUTANTS.length} mutants RED`)
}
process.exit(0)   // Vite's dev server leaves handles a closed server does not release
