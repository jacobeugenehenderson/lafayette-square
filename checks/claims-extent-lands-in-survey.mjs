#!/usr/bin/env node
/**
 * claims-extent-lands-in-survey.mjs — leaving Extent for the Designer lands in
 * Survey, by EVERY route. Checked by reading the source, never restating it.
 *
 *   node checks/claims-extent-lands-in-survey.mjs
 *
 * Jacob: "When I click 'Designer' from the Extent tool, the first stop MUST be
 * the Survey tool." The rule was first enforced per call site (the two pour
 * hand-offs) and the third exit — the ← Designer nav button — was missed. So
 * the rule lives in the store's `setShot`, and this check defends the two
 * things that make that sufficient:
 *
 *  1. `setShot` sets tool = 'surveyor' on extent → designer, directly — ⛔ not
 *     via `setTool`, which TOGGLES and so switched Survey OFF whenever it was
 *     already the tool.
 *  2. Nothing in src/ changes `shot` without going through `setShot` — so no
 *     route out of Extent can skip the rule, including ones added later.
 *
 * It also prints Extent's exits into the Designer, as a census.
 *
 * NOT covered: the live click. That was checked in the browser when this landed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STORE = 'src/cartograph/stores/useCartographStore.js'
const EXTENT = 'src/cartograph/ExtentApp.jsx'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const fails = []
const ok = []
const check = (name, pass, detail) => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)

// The body of `name: (...) => { ... }` inside the store, by brace matching.
function methodBody(src, name) {
  const at = src.indexOf(`  ${name}: (`)
  if (at < 0) return null
  const open = src.indexOf('{', src.indexOf('=>', at))
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return { start: open, end: i, text: src.slice(open, i + 1) }
  }
  return null
}

// ── 1. the rule lives in setShot ────────────────────────────────────────────
const store = read(STORE)
const setShot = methodBody(store, 'setShot')
check('setShot found in the store', !!setShot)
if (setShot) {
  const branch = setShot.text.match(/if\s*\(\s*get\(\)\.shot\s*===\s*'extent'\s*&&\s*shot\s*===\s*'designer'\s*\)\s*\{([\s\S]*?)\n\s*\}/)
  check('setShot has an extent → designer branch', !!branch)
  if (branch) {
    check('that branch sets tool to surveyor', /tool:\s*'surveyor'/.test(branch[1]))
    check("that branch persists cartograph-tool = 'surveyor'", /setItem\(\s*'cartograph-tool'\s*,\s*'surveyor'\s*\)/.test(branch[1]))
    check('that branch does not call setTool (it toggles)', !/setTool\s*\(/.test(branch[1]))
  }
}

// ── 2. nothing writes `shot` around setShot ─────────────────────────────────
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(n)) out.push(p)
  }
  return out
}
const bypass = []
let insideSetShot = 0
for (const file of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file)
  const src = readFileSync(file, 'utf8')
  // A write to the CARTOGRAPH store with `shot` as a KEY: `set({ shot… })` in the
  // store itself, `useCartographStore.setState({ shot… })` anywhere. (Other stores
  // — Preview's `useCamera` — have their own `shot`-ish fields and are not this.)
  const re = rel === STORE
    ? /\bset\(\s*\{\s*(?:[^{}]*?,\s*)?shot\s*[:,}]/g
    : /\buseCartographStore\.setState\(\s*\{\s*(?:[^{}]*?,\s*)?shot\s*[:,}]/g
  for (let m; (m = re.exec(src));) {
    if (rel === STORE && setShot && m.index > setShot.start && m.index < setShot.end) { insideSetShot++; continue }
    bypass.push(`${rel}:${src.slice(0, m.index).split('\n').length}`)
  }
}
check('the scan sees setShot\'s own shot writes (it is not vacuous)', insideSetShot > 0)
check('no code sets `shot` except through setShot', bypass.length === 0, bypass.join(', '))

// ── census: Extent's exits into the Designer ────────────────────────────────
const extent = read(EXTENT)
const exits = [...extent.matchAll(/setShot\(\s*'designer'\s*\)/g)].map(m => `${EXTENT}:${extent.slice(0, m.index).split('\n').length}`)
check('Extent has at least one exit into the Designer', exits.length > 0)
check('ExtentApp does not toggle Survey via setTool', !/setTool\(\s*'surveyor'\s*\)/.test(extent))

console.log(`Extent → Designer exits (all routed through setShot): ${exits.length}`)
for (const e of exits) console.log(`  · ${e}`)
for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
process.exit(fails.length ? 1 : 0)
