#!/usr/bin/env node
/**
 * THE KIT'S RENDERER-FREE DOOR LOADS WITHOUT A BROWSER, IN EVERY BUILD MODE IT READS (claim ② of
 * claims-the-pure-entry-loads-no-renderer; live because vite is; Zob 2026-11-02, extended the same day after Ward's pin run).
 *
 * An app's 2D module is loaded, in its checks, as vite SSR loads it (the Ward's happening-has-a-place: createServer with
 * appType 'custom', never listening, then ssrLoadModule): import.meta.env is present, window / document are not. The entry,
 * src/components/TownPure.js, must load there. A module-scope read of the host (document, a meta tag, window) that can
 * throw fails here even when the static check finds no renderer in its graph.
 * ⭐ RENDERER-FREE IS NOT IMPORT-SAFE (Boz, 2026-11-02): the door carried adoptSlabManifest ← slabUrl ← bakedUrl, whose base
 * is computed at module scope and, under VITE_ASSET_BASE=runtime (the Ward's build), refuses without the page's meta. Loaded
 * only under the kit's own env, that was never seen. So the load runs once per BUILD MODE THE LOADED GRAPH READS: every
 * `import.meta.env.VITE_*` read in a repo module the load reached (directly or through a `const x = import.meta.env.VITE_*`
 * alias), unset, and set to each string literal it is compared against (`=== 'runtime'`). One variable at a time, the
 * rest unset; no .env file is read and the shell's VITE_ variables are lifted, so the kit's mode is "nothing set". No variable or value is named
 * here: the modes are read from the code that loaded. No port is opened; each server is closed after.
 * Usage: node checks/claims-the-pure-entry-loads-without-a-browser.mjs [--mutants]
 *   --mutants (each → RED): a module-scope document read planted in a door lib · a module-scope refusal under a planted
 *   VITE_ mode, seen only when that mode is read and tried · the door re-exporting slabUrl.js (bakedUrl's runtime refusal).
 */
import { existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY_REL = 'src/components/TownPure.js'
// ⛔ NOT `envFile: false`: that turns off vite's loadEnv WHOLLY, process.env included (vite 5's resolveConfig: `userEnv =
// inlineConfig.envFile !== false && loadEnv(…)`), so no VITE_ mode would ever reach the code (measured: a mode "tried" that
// was never set, and two mutants SURVIVED). Instead env files are read from a directory that holds none, checked here.
const NO_ENV_DIR = resolve(ROOT, 'checks')

/** Load the entry once with `env` (VITE_* → value). `plant` maps a repo path to text appended to it.
 *  → { fails, sources: Map(repo path → the text vite was handed) } */
async function loadOnce(env, plant = {}) {
  // ⭐ the mode is EXACTLY `env`: every ambient VITE_ variable (the operator's shell) is lifted for the load and put back after
  const saved = {}
  for (const k of [...Object.keys(process.env).filter(k => k.startsWith('VITE_')), ...Object.keys(env)]) if (!(k in saved)) saved[k] = process.env[k]
  for (const k of Object.keys(saved)) delete process.env[k]
  for (const k of Object.keys(env)) process.env[k] = env[k]
  const sources = new Map()
  const plugins = [{ name: 'zob-record', enforce: 'pre', transform(code, id) {
    const rel = relative(ROOT, id.split('?')[0])
    if (rel.startsWith('..') || rel.includes('node_modules')) return null
    const out = plant[rel] ? code + '\n' + plant[rel] : code
    sources.set(rel, out)
    return plant[rel] ? out : null
  } }]
  let vite
  try {
    vite = await createServer({ root: ROOT, configFile: false, envDir: NO_ENV_DIR, appType: 'custom', logLevel: 'silent', plugins,
      server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
    const m = await vite.ssrLoadModule('/' + ENTRY_REL)
    return { fails: Object.keys(m).length ? [] : ['it loads with no exports'], sources }
  } catch (e) {
    return { fails: [String(e.message).split('\n')[0]], sources }
  } finally {
    await vite?.close()
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  }
}

/** The build modes a set of module texts reads: Map(VITE_X → Set of string literals it is compared against). */
export function modesOf(texts) {
  const modes = new Map()
  const add = (k, v) => { if (!modes.has(k)) modes.set(k, new Set()); if (v != null) modes.get(k).add(v) }
  for (const t of texts) {
    const names = new Map()          // a regex for a name in code → the VITE_ variable it holds
    for (const m of t.matchAll(/import\.meta\.env\.(VITE_\w+)/g)) { add(m[1]); names.set(`import\\.meta\\.env\\.${m[1]}\\b`, m[1]) }
    for (const m of t.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*import\.meta\.env\.(VITE_\w+)\b/g)) names.set(`\\b${m[1].replace(/\$/g, '\\$')}\\b`, m[2])
    for (const [re, k] of names) {
      for (const m of t.matchAll(new RegExp(`${re}\\s*[!=]==?\\s*(['"\`])([^'"\`]*)\\1`, 'g'))) add(k, m[2])
      for (const m of t.matchAll(new RegExp(`(['"\`])([^'"\`]*)\\1\\s*[!=]==?\\s*${re}`, 'g'))) add(k, m[2])
    }
  }
  return modes
}

/** ② over every mode: the kit's own (nothing set) first; then each VITE_ variable the loaded graph reads, set to each value
 *  it is compared against. A mode found only by a later load (a module reached only under it) is tried too. */
async function judge(plant = {}) {
  const fails = [], tried = [], queue = [{}], seen = new Map()
  while (queue.length) {
    const env = queue.shift()
    tried.push(env)
    const r = await loadOnce(env, plant)
    const label = Object.keys(env).length ? Object.entries(env).map(([k, v]) => `${k}=${v}`).join(' ') : 'the kit\'s env (no VITE_ variable set)'
    for (const f of r.fails) fails.push(`${ENTRY_REL} does not load without a browser under ${label}: ${f}`)
    for (const [k, vals] of modesOf([...r.sources.values()])) {
      if (!seen.has(k)) seen.set(k, new Set())
      for (const v of vals) if (!seen.get(k).has(v)) { seen.get(k).add(v); queue.push({ [k]: v }) }
    }
  }
  return { fails, modes: tried }
}

if (readdirSync(NO_ENV_DIR).some(f => f.startsWith('.env'))) { console.log(`⛔ ${relative(ROOT, NO_ENV_DIR)} holds a .env file: the modes would not be the ones tried`); process.exit(1) }
if (!existsSync(resolve(ROOT, ENTRY_REL))) { console.log(`⛔ no ${ENTRY_REL}: the kit has no renderer-free door yet`); process.exit(1) }

// self-test of the mode reader on planted text: direct, aliased, reversed, a prefix-sharing name, and one compared to nothing
{
  const m = modesOf(["const B = import.meta.env.VITE_A\nif (B === 'runtime') x()\nif ('edge' !== import.meta.env.VITE_C) y()\nconst z = import.meta.env.VITE_D\nif (import.meta.env.VITE_AA === 'no') w()"])
  const got = JSON.stringify([...m].map(([k, v]) => [k, [...v].sort()]).sort())
  const want = JSON.stringify([['VITE_A', ['runtime']], ['VITE_AA', ['no']], ['VITE_C', ['edge']], ['VITE_D', []]])
  if (got !== want) { console.log(`⛔ [self-test] the mode reader reads ${got}, not ${want}`); process.exit(1) }
}

const { fails, modes } = await judge()
const said = modes.map(e => Object.keys(e).length ? Object.entries(e).map(([k, v]) => `${k}=${v}`).join(' ') : 'nothing set').join(' · ')
if (fails.length) { console.log('⛔ ' + fails.join('\n⛔ ')); process.exitCode = 1 }
else console.log(`✅ ${ENTRY_REL} loads as an app's 2D module is loaded (vite SSR, no window) under every build mode its graph reads: ${said}`)

if (process.argv.includes('--mutants')) {
  const LIB = 'src/lib/frameSlices.js'
  const MUTANTS = [
    ['a module-scope document read in a door lib', { [LIB]: "document.querySelector('meta[name=\"zob-mutant\"]')" }],
    ['a module-scope refusal under a planted VITE_ mode (seen only when that mode is read and tried)',
      { [LIB]: "const ZOB_MODE = import.meta.env.VITE_ZOB_MUTANT_MODE\nif (ZOB_MODE === 'runtime' && typeof document === 'undefined') throw new Error('[zob mutant] no page')" }],
    ['the door re-exporting slabUrl.js (bakedUrl refuses at load under its runtime mode)', { [ENTRY_REL]: "export { adoptSlabManifest as __zobMutant } from '../lib/slabUrl.js'" }],
  ]
  for (const [name, plant] of MUTANTS) {
    const r = await judge(plant)
    console.log(`${r.fails.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${r.fails.length ? ` (${r.fails.length})` : ''}`)
    if (!r.fails.length) process.exitCode = 1
  }
}
