#!/usr/bin/env node
/**
 * scripts/bake-in-flight.mjs — IS A BAKE OR POUR RUNNING? Ask before saving anything the
 * dev servers import (`serve.js`, its imports, `src/instances/*.js`): they run under
 * `node --watch`, and a save restarts them and kills the bake mid-flight (Jacob saw a 500).
 *
 * ⛔ Written because the hand-rolled version failed silently TWICE on 2026-09-24: this
 * machine's `find` is bfs, which rejects `-newermt "-3 minutes"`; with stderr hidden that
 * prints NOTHING, which reads as "quiet". This walks the tree itself and prints the
 * absolute cutoff it used, so a wrong answer is visible.
 *
 *   node scripts/bake-in-flight.mjs [--minutes=5]
 * Exit 0 = quiet · 1 = something is in flight (usable as a guard: `… && edit`).
 */
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '..')
const mins = +(process.argv.find(a => a.startsWith('--minutes='))?.slice(10) || 5)
const cutoff = Date.now() - mins * 60_000
const hhmmss = (t) => new Date(t).toTimeString().slice(0, 8)

// 1. Processes. The pour/bake chain runs as child `node` processes of the dev server.
const PROC = /(bake-[\w-]+\.(m?js)|pipeline\.js|promote-ribbons\.js|derive\.js|skeleton\.js|fetch[\w-]*\.(m?js)|scripts\/\d\d[\w-]*\.py)/
const procs = execFileSync('ps', ['-ax', '-o', 'pid=,etime=,command='], { encoding: 'utf8' })
  // Only the interpreters themselves — a shell wrapper whose command TEXT names a bake
  // script (every agent's `zsh -c …`) is not a bake.
  .split('\n').filter(l => /^\s*\d+\s+\S+\s+(\S*\/)?(node|python3?)\b/.test(l) && PROC.test(l) && !l.includes('bake-in-flight'))
  .map(l => l.trim().replace(/\s+/g, ' ').slice(0, 160))

// 2. Recent writes where a pour (cartograph/data/*/clean) or a bake (public/baked) lands.
const recent = []
const walk = (dir) => {
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const d of ents) {
    const p = join(dir, d.name)
    if (d.isDirectory()) walk(p)
    else { const t = statSync(p).mtimeMs; if (t >= cutoff) recent.push([t, p.slice(ROOT.length + 1)]) }
  }
}
walk(join(ROOT, 'public', 'baked'))
const data = join(ROOT, 'cartograph', 'data')
if (existsSync(data)) for (const s of readdirSync(data)) walk(join(data, s, 'clean'))
recent.sort((a, b) => b[0] - a[0])

console.log(`bake-in-flight — now ${hhmmss(Date.now())}, looking back to ${hhmmss(cutoff)} (${mins} min)`)
console.log(`  processes: ${procs.length ? '' : 'none'}`)
for (const p of procs) console.log(`    ${p}`)
console.log(`  writes to public/baked/ or cartograph/data/*/clean/ since ${hhmmss(cutoff)}: ${recent.length || 'none'}`)
for (const [t, p] of recent.slice(0, 12)) console.log(`    ${hhmmss(t)}  ${p}`)
if (recent.length > 12) console.log(`    … ${recent.length - 12} more`)
const busy = procs.length || recent.length
console.log(busy ? '⛔ IN FLIGHT — do not save anything the dev servers import.' : '✅ quiet.')
process.exit(busy ? 1 : 0)
