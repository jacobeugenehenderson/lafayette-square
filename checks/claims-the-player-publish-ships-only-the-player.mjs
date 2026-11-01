#!/usr/bin/env node
/**
 * "DOES THE KIT-PLAYER PUBLISH SHIP THE TOWN PLAYER AND NOTHING THE OPERATOR APPS BROUGHT WITH IT?"
 *
 * WHY (2026-10-30; ruled by Boz). One `vite build` makes the player and the five operator apps, and every built
 * file shipped, so the authoring tools were public at staging.theward.online/_player/ and copied into towns'
 * production players by Promote. The publish now ships by scripts/player-graph.mjs#playerShipSet.
 *   ① THE DECISION, on a fixture build shaped as the measured one: a player chunk reached only by a dynamic import, its
 *     css and assets, a chunk shared with an operator app, a worker and each town's content/ (which the Vite manifest
 *     does not name), a public/ file, and an untracked public/ file. Ships: the player's graph and everything the
 *     manifest does not know that public/ allows. Never: another entry's page, a file only another entry reaches, the
 *     build manifest, an untracked public/ file. A manifest with no player entry refuses.
 *   ② THE BUILD writes the manifest the publish reads: vite.config.js (loaded for `build`) sets build.manifest.
 *   ③ THE PUBLISH uses it, by source: publish-player-to-staging ships `playerShipSet`'s `ship` and refuses a build
 *     with no Vite manifest; the manifest it writes for Promote is made from that same set.
 * `--mutants`: each edit below must turn this RED. ⛔ READ-ONLY: each mutant in memory (checks/_importSource.mjs), the config
 * as a temp file (checks/_sourceFile.mjs; Vite reads a config by path); never a copy beside the source (the one-loader ruling).
 *
 * Usage: node checks/claims-the-player-publish-ships-only-the-player.mjs [--mutants]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importSource } from './_importSource.mjs'
import { sourceFile } from './_sourceFile.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const P = {
  graph: join(ROOT, 'scripts/player-graph.mjs'),
  publish: join(ROOT, 'scripts/publish-player-to-staging.mjs'),
  config: join(ROOT, 'vite.config.js'),
}
let seq = 0
const load = (p) => import(pathToFileURL(p).href + `?v=${++seq}`)

const MANIFEST = {
  'index.html': { file: 'assets/main-a.js', src: 'index.html', isEntry: true, imports: ['_react.js', '_shared.js'],
    dynamicImports: ['src/Lazy.jsx'], css: ['assets/main-a.css'], assets: ['assets/logo-a.png'] },
  '_react.js': { file: 'assets/react-r.js' },
  '_shared.js': { file: 'assets/shared-s.js', imports: ['_react.js'] },
  'src/Lazy.jsx': { file: 'assets/Lazy-l.js', isDynamicEntry: true, css: ['assets/Lazy-l.css'] },
  'cartograph.html': { file: 'assets/cartograph-c.js', src: 'cartograph.html', isEntry: true, imports: ['_react.js', '_shared.js', '_opOnly.js'],
    dynamicImports: ['src/OpLazy.jsx'], css: ['assets/cartograph-c.css'] },
  '_opOnly.js': { file: 'assets/opOnly-o.js' },
  'src/OpLazy.jsx': { file: 'assets/OpLazy-x.js', isDynamicEntry: true },
}
const SHIP = ['index.html', 'assets/main-a.js', 'assets/main-a.css', 'assets/logo-a.png', 'assets/react-r.js', 'assets/shared-s.js',
  'assets/Lazy-l.js', 'assets/Lazy-l.css', 'assets/rgPageWorker-w.js', 'content/fx/logo.png', 'weather-icons/rain.svg', 'textures/a.ktx2']
const OPERATOR = ['cartograph.html', 'assets/cartograph-c.js', 'assets/cartograph-c.css', 'assets/opOnly-o.js', 'assets/OpLazy-x.js', '.vite/manifest.json']
const UNTRACKED = ['photos/x.jpg']

async function run(paths) {
  const fails = []
  // ── ① ──
  const G = paths.graphModule ? await paths.graphModule() : await load(paths.graph)
  const all = [...SHIP, ...OPERATOR, ...UNTRACKED].map((rel) => ({ rel, abs: `/dist/${rel}`, bytes: 1 }))
  const got = G.playerShipSet(all, MANIFEST, (rel) => !UNTRACKED.includes(rel))
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  const rels = (fs) => fs.map((f) => f.rel)
  if (!same(rels(got.ship), SHIP)) fails.push(`① ships ${JSON.stringify(rels(got.ship).filter((r) => !SHIP.includes(r)))} it must not, misses ${JSON.stringify(SHIP.filter((r) => !rels(got.ship).includes(r)))}`)
  if (!same(rels(got.operator), OPERATOR)) fails.push(`① calls ${JSON.stringify(rels(got.operator))} the operator apps', want ${JSON.stringify(OPERATOR)}`)
  if (!same(rels(got.untracked), UNTRACKED)) fails.push(`① untracked public/: ${JSON.stringify(rels(got.untracked))}`)
  try { G.playerShipSet(all, { 'cartograph.html': MANIFEST['cartograph.html'] }, () => true); fails.push('① a build manifest with no player entry did not refuse') } catch { /* refused */ }
  // ── ② ──
  const { loadConfigFromFile } = await import('vite')
  const { config } = await loadConfigFromFile({ command: 'build', mode: 'production' }, paths.config, ROOT, 'silent')
  if (!config.build?.manifest) fails.push('② vite.config.js does not set build.manifest — the publish cannot tell the player from the operator apps')
  // ── ③ ──
  const src = paths.publishText ?? readFileSync(paths.publish, 'utf8')   // a mutant's publish is its text
  if (!/const \{ ship: files, operator, untracked: dropped \} = playerShipSet\(all, /.test(src)) fails.push('③ publish-player-to-staging does not ship playerShipSet\'s set')
  if (!/if \(!existsSync\(viteManifestAt\)\) throw new Error\(/.test(src)) fails.push('③ publish-player-to-staging does not refuse a build with no Vite manifest')
  if (!/files: \[\.\.\.files\.map\(\(f\) => f\.abs\), townsTmp\]/.test(src)) fails.push('③ the manifest Promote copies from is not made from the shipped set')
  return fails
}

const MUTANTS = [
  ['an operator entry\'s page ships', 'graph', "    if (c.isEntry && key !== entry && key.endsWith('.html')) out.add(key)\n", ''],
  ['the player\'s dynamic imports not followed', 'graph', '...(c.imports || []), ...(c.dynamicImports || [])', '...(c.imports || [])'],
  ['the player\'s css not followed', 'graph', 'for (const f of [...(c.css || []), ...(c.assets || [])]) files.add(f)', 'for (const f of [...(c.assets || [])]) files.add(f)'],
  ['everything outside the graph dropped (content/, the worker, public/ files)', 'graph', 'notPlayers.has(f.rel) ? operator', '!graphOf(manifest, entry).has(f.rel) ? operator'],
  ['the build manifest ships', 'graph', 'const out = new Set([VITE_MANIFEST])', 'const out = new Set()'],
  ['the publish ships every built file', 'publish', 'const { ship: files, operator, untracked: dropped } = playerShipSet(all, ', 'const { ship: files, operator, untracked: dropped } = { ship: all, operator: [], untracked: [] } || playerShipSet(all, '],
  ['the publish ships everything when there is no Vite manifest', 'publish', 'if (!existsSync(viteManifestAt)) throw new Error(', 'if (false) throw new Error('],
  ['the build writes no manifest', 'config', '    manifest: true,\n', ''],
]

// a mutant, in memory: the graph imported edited, the publish's text edited, the config edited into a temp file
let mseq = 0
const mutated = (which, edit) => which === 'graph' ? { ...P, graphModule: () => importSource('scripts/player-graph.mjs', { transform: (s) => `${edit(s)}\n// load ${++mseq}\n` }) }
  : which === 'publish' ? { ...P, publishText: edit(readFileSync(P.publish, 'utf8')) }
  : { ...P, config: sourceFile('vite.config.js', { transform: edit }) }

const fails = await run(P)
if (fails.length) { console.error(`⛔ the kit-player publish ships more than the player:\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log('✅ the kit-player publish ships the player\'s graph and what public/ allows; never an operator app, its chunks, or the build manifest')

if (process.argv.includes('--mutants')) {
  let alive = 0
  // ⛔ the controls: a no-op edit through each in-memory path must read GREEN, else every mutant's "RED" is the loader's
  for (const which of ['graph', 'publish', 'config']) {
    const f = await run(mutated(which, (s) => s))
    if (f.length) { console.error(`⛔ the in-memory ${which} fails unmutated — the mutants prove nothing:\n   ${f.join('\n   ')}`); process.exit(1) }
  }
  for (const [name, which, from, to] of MUTANTS) {
    const src = readFileSync(P[which], 'utf8')
    if (!src.includes(from)) { console.error(`⛔ mutant "${name}": its target text is gone from ${P[which]} — re-aim it`); alive++; continue }
    let red, threw = ''
    try { red = (await run(mutated(which, (s) => s.replace(from, to)))).length > 0 } catch (e) { red = true; threw = ` (by throwing: ${e.message.slice(0, 80)})` }
    console.log(`   ${red ? 'RED  ' : 'ALIVE'} ${name}${threw}`)
    if (!red) alive++
  }
  if (alive) { console.error(`⛔ ${alive} mutant(s) survived — the check cannot see that edit`); process.exit(1) }
  console.log(`✅ all ${MUTANTS.length} mutants RED`)
}
