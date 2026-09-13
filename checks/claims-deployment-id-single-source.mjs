#!/usr/bin/env node
/**
 * Do all the Apps Script deployment IDs still agree?
 *
 * Every API URL in the project must carry the same deployment ID. When they
 * drift you get "Unknown-action" errors, because an older deployment does not
 * have the newer endpoints — a failure that reads like a broken feature rather
 * than a stale URL.
 *
 * ⛔ PUBLISH.md listed the locations BY HAND and its own verification grep named
 * three files. Both were wrong: `worker.js:1` hardcodes the same ID and appeared
 * in neither, so a drifted worker would have reported clean. A hand-kept list of
 * where a value lives is the same rot as a hand-kept copy of the value.
 *
 * So this SEARCHES instead of listing, and it is the reason it can be trusted:
 * a new location added anywhere in the repo is picked up without editing here.
 *
 * ⚠️ Two locations cannot be reached from the filesystem and are reported as
 * MANUAL rather than silently passed — the GitHub Secret `VITE_API_URL` and the
 * Supabase secret `GAS_API_URL` (which the commerce-write edge function uses to
 * reach `guardian-check`). A check that says nothing about what it cannot see is
 * a check that lies toward "fine".
 *
 *   node scratch/claims-deployment-id-single-source.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
// ⚠️ `public` is NOT skipped — `public/codedesk/index.html` is a real location
// and skipping it was this file's own first bug. `public/baked` (the slab) and
// `.claude/worktrees` (stale copies of the whole repo) are skipped by path below.
const SKIP = new Set(['node_modules', 'dist', '.git', '_archive', '_landscape-intake', 'photos-wikimedia', 'models', 'assets', '.claude'])
const SKIP_PATH = ['public/baked', 'public/trees', 'public/clouds']
const EXT = /\.(js|jsx|ts|tsx|mjs|md|html|json|yml|yaml|env)$/i
const ID = /AKfycb[A-Za-z0-9_-]{40,}/g

const hits = new Map() // id -> [locations]
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) {
      if (SKIP_PATH.some(sp => relative(ROOT, p).startsWith(sp))) continue
      walk(p); continue
    }
    if (!EXT.test(name) && name !== '.env') continue
    let src
    try { src = readFileSync(p, 'utf8') } catch { continue }
    for (const m of src.matchAll(ID)) {
      if (!hits.has(m[0])) hits.set(m[0], [])
      const rel = relative(ROOT, p)
      if (!hits.get(m[0]).includes(rel)) hits.get(m[0]).push(rel)
    }
  }
}
walk(ROOT)
// .env is gitignored but is a real location — read it explicitly if present.
const envPath = join(ROOT, '.env')
if (existsSync(envPath)) {
  for (const m of readFileSync(envPath, 'utf8').matchAll(ID)) {
    if (!hits.has(m[0])) hits.set(m[0], [])
    if (!hits.get(m[0]).includes('.env')) hits.get(m[0]).push('.env')
  }
}

const ids = [...hits.keys()]
console.log(`Apps Script deployment ID — ${ids.length} distinct value(s) across ${[...hits.values()].flat().length} location(s)\n`)
for (const [id, locs] of hits) {
  console.log(`  ${id.slice(0, 16)}…`)
  for (const l of locs.sort()) console.log(`      ${l}`)
}

console.log('\n  MANUAL — not reachable from the filesystem, verify by hand:')
console.log('      GitHub Secret  VITE_API_URL   (Settings → Secrets → Actions)')
console.log('      Supabase secret GAS_API_URL   (used by the commerce-write edge function)')
if (!existsSync(envPath)) console.log('      .env            (absent here — present on the dev machine)')

if (ids.length <= 1) {
  console.log(`\nPASS — ${ids.length === 0 ? 'no deployment ID found in tracked files' : 'every in-repo location carries the same ID'}`)
  process.exit(0)
}
console.log(`\nFAIL — ${ids.length} different deployment IDs are in use. Older deployments lack newer actions, so this surfaces as "Unknown-action".`)
process.exit(1)
