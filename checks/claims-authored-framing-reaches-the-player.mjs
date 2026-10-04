#!/usr/bin/env node
// claims-authored-framing-reaches-the-player.mjs — DOES THE WARD READ EVERY FRAMING KEY THE BAKE WRITES?
//
// Phase 2 B (BRIEF-phase2-B-camera-authority; map §7 #1). `browseFrame` was authored in Stage, baked into scene.json,
// and read by no runtime: the Ward framed the plan by its own rule while the operator's frame shipped unread. That
// is the shape this catches, for every key: AUTHORED, BAKED, and nothing in the player's import graph reads it.
//
// ⭐ Reads the source, restates nothing. The framing keys are the ones bake-scene writes in its camera block (from
// the `shots:` line through `heroMotion:`); the player is the Ward's import graph from theward/src/main.jsx,
// following its imports into the kit. A key is READ when a module in that graph reaches it as a property in code —
// `.key`, `?.key` or `['key']` (comments stripped; an import path or a log string is not a read).
// ONE key is not framing, by ruling: `heroSubject`, the set-piece designation — H-7, "the camera is not tied to it";
// claims-the-camera-has-one-definition (a) fails any camera that reads it. It is listed, never failed.
//
// The Ward imports the kit through its PIN (the ward-kit worktree, theward/checks/kit.mjs). By default the graph
// follows the pin — what the Ward reads TODAY. KIT_DIR=<kit> re-roots those imports onto another kit tree, which shows
// what the Ward will read after the pin moves: run it with KIT_DIR=. before moving the pin.
//
//   node checks/claims-authored-framing-reaches-the-player.mjs            # the Ward as pinned
//   KIT_DIR=. node checks/claims-authored-framing-reaches-the-player.mjs  # the Ward on this kit
// Read-only. Exits 1 on an unread key, and on a missing Ward or an unparsable bake (never a skipped half).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WARD = path.resolve(process.env.WARD_DIR || path.join(process.env.HOME || '', 'Desktop/dev.nosync/theward'))
const ENTRY = path.join(WARD, 'src/main.jsx')
const PIN = path.join(ROOT, '.claude/worktrees/ward-kit')
const KIT = process.env.KIT_DIR ? path.resolve(process.env.KIT_DIR) : null
if (!fs.existsSync(ENTRY)) { console.error(`⛔ the Ward is not at ${WARD} (no src/main.jsx) — set WARD_DIR`); process.exit(1) }

// ── the framing keys, read off bake-scene's camera block ──
const bake = fs.readFileSync(path.join(ROOT, 'cartograph/bake-scene.js'), 'utf8')
const from = bake.search(/^\s*shots:\s/m), to = bake.search(/^\s*heroMotion:\s/m)
if (from < 0 || to < from) { console.error('⛔ bake-scene.js: cannot find its camera block (shots: … heroMotion:) — the check is blind'); process.exit(1) }
const block = bake.slice(from, bake.indexOf('\n', to))
const NOT_FRAMING = { heroSubject: 'H-7: no camera reads the set-piece (claims-the-camera-has-one-definition a)' }
const KEYS = [...block.matchAll(/^\s*([A-Za-z]\w*)\s*:/gm)].map(m => m[1])
if (KEYS.length < 3) { console.error(`⛔ bake-scene.js camera block parsed to ${KEYS.length} keys — the check is blind`); process.exit(1) }

// ── the Ward's import graph ──
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
const EXTS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']
const rerooted = (p) => (KIT && p.startsWith(PIN + path.sep) ? path.join(KIT, path.relative(PIN, p)) : p)
function resolve(spec, dir) {
  if (!spec.startsWith('.')) return null                     // a package: not the town's code
  const base = rerooted(path.resolve(dir, spec))
  for (const e of EXTS) { const p = base + e; if (fs.existsSync(p) && fs.statSync(p).isFile()) return p }
  return null
}
const importRe = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g
const seen = new Map()
const queue = [ENTRY]
while (queue.length) {
  const f = queue.pop()
  if (seen.has(f) || !/\.(m?js|jsx)$/.test(f)) continue
  const src = code(fs.readFileSync(f, 'utf8'))
  seen.set(f, src)
  for (const m of src.matchAll(importRe)) {
    const p = resolve(m[1] || m[2] || m[3], path.dirname(f))
    if (p && !seen.has(p)) queue.push(p)
  }
}
const inKit = [...seen.keys()].filter(f => f.startsWith((KIT || PIN) + path.sep)).length
if (!inKit) { console.error(`⛔ the Ward's graph reaches no kit module under ${KIT || PIN} — the check is blind`); process.exit(1) }

// ── who reads each key ──
const rel = (f) => path.relative(f.startsWith(WARD) ? WARD : (KIT || PIN), f)
console.log(`the Ward's import graph: ${seen.size} modules (${inKit} in the kit at ${KIT ? 'KIT_DIR ' + KIT : 'the pin'})`)
console.log(`framing keys bake-scene writes: ${KEYS.join(', ')}\n`)
let unread = 0
for (const k of KEYS) {
  const re = new RegExp(`(?:\\.|\\?\\.)${k}\\b|\\[['"]${k}['"]\\]`)
  const readers = [...seen].filter(([, s]) => re.test(s)).map(([f]) => rel(f))
  if (NOT_FRAMING[k]) { console.log(`·  ${k.padEnd(14)} not framing — ${NOT_FRAMING[k]}${readers.length ? ` (yet read by ${readers.join(', ')})` : ''}`); continue }
  if (!readers.length) unread++
  console.log(`${readers.length ? '✅' : '⛔'} ${k.padEnd(14)} ${readers.length ? readers.slice(0, 3).join(' · ') + (readers.length > 3 ? ` (+${readers.length - 3})` : '') : 'baked, and read by nothing the Ward imports'}`)
}
process.exit(unread ? 1 : 0)
