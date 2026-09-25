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
 * ⛔ NEVER PIPE IT IN A GUARD: `node scripts/bake-in-flight.mjs | tail -1 && save` gates on
 *   TAIL's exit code, which is always 0, so the save runs during a bake (it did, 2026-09-25).
 *   Use `--quiet` (prints only the verdict line) instead of a pipe.
 *   node scripts/bake-in-flight.mjs --self-test
 *
 * ⛔ WRITES ALONE DO NOT PROVE A BAKE. `git worktree add` (or a checkout) stamps many
 * files at ONE instant, backups included, and the first version called that IN FLIGHT
 * with no bake process running (Boz, 2026-09-24). IN FLIGHT = a bake/pour process, OR
 * artifact writes (not backups) spread over more than one second — a bake between steps
 * has no process for a moment but leaves a trail over time.
 */
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
const mins = +(process.argv.find(a => a.startsWith('--minutes='))?.slice(10) || 5)
const quiet = process.argv.includes('--quiet')
// Test hook: the self-test runs this script as a CHILD with a simulated state and asserts the EXIT CODE.
const SIM = process.env.BAKE_IN_FLIGHT_SIMULATE || null   // 'busy' | 'quiet'
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

/** Seconds a write burst must span to read as a bake. A git checkout/worktree touch is one burst. */
const TRAIL_MIN_SPAN_S = 5

/** The decision, pure so the self-test can drive it. */
export function decide(procs, recent) {
  const BACKUP = /\.(backup|bak|prebak|pre-reset|pre)([-.\w]*)?$|\.backup-\d+/
  const artifacts = recent.filter(([, p]) => !BACKUP.test(p))
  // A TRAIL, not a timestamp count: a checkout that straddles a second boundary reads as
  // "two instants", so require the artifact writes to SPAN a few seconds. A bake step's
  // outputs land seconds to minutes apart; a git touch lands within one burst.
  const ts = artifacts.map(([t]) => t)
  const spanS = ts.length ? (Math.max(...ts) - Math.min(...ts)) / 1000 : 0
  const trail = spanS >= TRAIL_MIN_SPAN_S
  return { busy: procs.length > 0 || trail, trail, artifacts: artifacts.length, spanS }
}

if (process.argv.includes('--self-test')) {
  const T = 1_790_000_000_000
  const cases = [
    ['nothing', [], [], false],
    ['a bake process', ['123 01:00 node cartograph/bake-ground.js'], [], true],
    ['worktree-add mass touch (one instant, backups included) ⇒ NOT in flight', [],
      Array.from({ length: 24 }, (_, i) => [T + (i % 3), i % 2 ? `cartograph/data/lafayette-square/clean/overlay.json.backup-17${i}` : `public/baked/x/f${i}.json`]), false],
    ['mass touch straddling a second boundary ⇒ NOT in flight', [],
      [[T + 999, 'public/baked/x/a.json'], [T + 1001, 'public/baked/x/b.json'], [T + 1400, 'public/baked/x/c.json']], false],
    ['a bake between steps: artifacts over time, no process', [], [[T, 'public/baked/x/ground.json'], [T + 40_000, 'public/baked/x/ground.bin']], true],
    ['only backups, spread over time', [], [[T, 'a/overlay.json.backup-1'], [T + 9_000, 'a/map.json.bak']], false],
  ]
  let bad = 0
  // ⭐ THE EXIT CODE IS THE CONTRACT A GUARD RELIES ON: run this script as a child and assert it.
  const { spawnSync } = await import('node:child_process')
  for (const [state, want] of [['busy', 1], ['quiet', 0]]) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--quiet'], { env: { ...process.env, BAKE_IN_FLIGHT_SIMULATE: state } })
    const ok = r.status === want
    console.log(`  ${ok ? '✓' : '⛔'} exit code when ${state} → ${r.status} (want ${want})`)
    if (!ok) bad++
  }
  for (const [name, p, r, want] of cases) {
    const got = decide(p, r).busy
    console.log(`  ${got === want ? '✓' : '⛔'} ${name} → ${got ? 'IN FLIGHT' : 'quiet'}`)
    if (got !== want) bad++
  }
  process.exit(bad ? 1 : 0)
}

const d = SIM ? { busy: SIM === 'busy', trail: false, artifacts: 0, spanS: 0 } : decide(procs, recent)
if (!quiet) console.log(`bake-in-flight — now ${hhmmss(Date.now())}, looking back to ${hhmmss(cutoff)} (${mins} min)`)
if (!quiet) console.log(`  processes: ${procs.length ? '' : 'none'}`)
if (!quiet) for (const p of procs) console.log(`    ${p}`)
if (!quiet) console.log(`  writes to public/baked/ or cartograph/data/*/clean/ since ${hhmmss(cutoff)}: ${recent.length || 'none'}` +
  (recent.length ? ` (${d.artifacts} artifact, spanning ${d.spanS.toFixed(1)} s — ${d.trail ? 'a bake-shaped trail' : 'one burst or backups only: a checkout/worktree touch, not a bake'})` : ''))
if (!quiet) for (const [t, p] of recent.slice(0, 12)) console.log(`    ${hhmmss(t)}  ${p}`)
if (!quiet && recent.length > 12) console.log(`    … ${recent.length - 12} more`)
console.log(d.busy ? '⛔ IN FLIGHT — do not save anything the dev servers import.' : '✅ quiet.')
process.exit(d.busy ? 1 : 0)
