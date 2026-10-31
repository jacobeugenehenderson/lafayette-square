#!/usr/bin/env node
/**
 * "IS A REFUSAL EVER RETRIED, OR DRAWN AS NOTHING IN SILENCE?" (BRIEF-a-refusal-is-never-swallowed, Boz, 2026-10-31.)
 *
 * Layer 0, question 2: a kit fails loudly. The kit's refusals are `⛔` errors; this proves they stay loud.
 *   1. THE CONTRACT, read from every source file under src/: every `new <X>(…)` whose message carries ⛔ is built as a
 *      Refusal or a Transient (src/lib/refusal.js), or a class that extends one, or by httpFailure(res, …). The message is
 *      read from a literal, or through a `const` the argument names. Counted by form (thrown at once, Promise.reject,
 *      stored then thrown, other) so the census is re-derived here and never quoted. Its blind spot is printed as a
 *      count: an untyped `new Error(x)` whose message is a call or a server's answer cannot be read.
 *   2. httpFailure, driven: no answer, 5xx, 408 and 429 → Transient; any other status (404) → Refusal.
 *   3. R3FErrorBoundary, driven: a Refusal is reported to the one sink at once, keyed to the town in TownContext, with no
 *      retry scheduled, and the layer renders nothing; an untyped crash is retried on every delay and, when the last one
 *      fails, reported as given up with its reason.
 *   5. THE DEV FLAG (`?refuse=<layer>`, for seeing the banner in Stage) is gone from a production build.
 *   4. ONE SINK: exactly one store of failures under src/ (src/lib/failures.js); both boundaries report to it; Stage
 *      shows it at the top of its panel.
 *
 * Usage: node checks/claims-a-refusal-is-never-swallowed.mjs [--mutants] [-v]
 *   --mutants: the boundary retries a Refusal · the boundary drops the report · it never reports giving up · an untyped
 *   `⛔` throw returns · a ⛔ message held in a const returns untyped · httpFailure calls a 503 a Refusal · a second sink
 *   returns · the dev flag loses its gate · Stage drops the banner
 *   → each must go red.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'
import { importSource, sourceOf } from './_importSource.mjs'

const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser'), traverse = require('@babel/traverse').default
const VERBOSE = process.argv.includes('-v')
const failures = (await import(pathToFileURL(join(ROOT, 'src/lib/failures.js')))).default

const SRC = execSync('git ls-files --cached --others --exclude-standard src', { cwd: ROOT }).toString().trim().split('\n').filter(f => /\.(js|jsx|mjs)$/.test(f))
const textOf = (n) => !n ? '' : n.type === 'StringLiteral' ? n.value : n.type === 'TemplateLiteral' ? n.quasis.map(q => q.value.cooked).join('') :
  n.type === 'BinaryExpression' ? textOf(n.left) + textOf(n.right) : n.type === 'ConditionalExpression' ? textOf(n.consequent) + textOf(n.alternate) : ''
const readable = (n) => !!n && ['StringLiteral', 'TemplateLiteral', 'BinaryExpression', 'ConditionalExpression'].includes(n.type)

// ── 1. the contract ───────────────────────────────────────────────────────────────────────────────────────────────────
const PER_FILE = new Map()   // text → { error, classes, sites, unreadable }: each distinct text parsed and walked once
function readFile(f, text) {
  const key = f + '\0' + text
  if (PER_FILE.has(key)) return PER_FILE.get(key)
  const out = { error: null, classes: [], sites: [], http: 0, unreadable: 0 }
  let ast
  try { ast = parse(text, { sourceType: 'module', plugins: ['jsx'] }) } catch (e) { out.error = e.message; PER_FILE.set(key, out); return out }
  traverse(ast, {
    Class(p) { if (p.node.id && p.node.superClass?.type === 'Identifier') out.classes.push([p.node.id.name, p.node.superClass.name]) },
    NewExpression(p) {
      const c = p.node.callee.type === 'Identifier' ? p.node.callee.name : null
      if (!c || !/^[A-Z]/.test(c)) return
      let a = p.node.arguments[0], via = ''
      if (a?.type === 'Identifier') { const b = p.scope.getBinding(a.name); if (b?.path.isVariableDeclarator() && b.constant) { a = b.path.node.init; via = ` (through const ${p.node.arguments[0].name})` } }
      if (!readable(a)) { if (c === 'Error' && a) out.unreadable++; return }
      if (!textOf(a).includes('⛔')) return
      const par = p.parentPath
      const form = par.isThrowStatement() ? 'thrown at once' : par.isCallExpression() && par.node.callee.property?.name === 'reject' ? 'Promise.reject'
        : par.isVariableDeclarator() || par.isAssignmentExpression() ? 'stored, then thrown' : 'other'
      out.sites.push({ c, via, form, line: p.node.loc.start.line })
    },
    CallExpression(p) { if (p.node.callee.type === 'Identifier' && p.node.callee.name === 'httpFailure' && textOf(p.node.arguments[1]).includes('⛔')) out.http++ },
  })
  PER_FILE.set(key, out); return out
}

function contract(files) {
  const fails = [], parent = new Map(), read = files.map(([f, t]) => [f, readFile(f, t)])
  for (const [f, r] of read) { if (r.error) fails.push(`${f} does not parse (${r.error}): its throws cannot be read`); for (const [k, v] of r.classes) parent.set(k, v) }
  const root = (c) => { for (let i = 0; c && i < 20; i++) { if (c === 'Refusal' || c === 'Transient') return c; c = parent.get(c) } return null }
  const forms = {}, ctors = {}; let http = 0, unreadable = 0
  for (const [f, r] of read) {
    http += r.http; unreadable += r.unreadable
    for (const { c, via, form, line } of r.sites) {
      const kind = root(c)
      if (!kind && !/Error$/.test(c)) continue   // a ⛔ string handed to some other constructor is not an error
      forms[form] = (forms[form] || 0) + 1; ctors[kind || c] = (ctors[kind || c] || 0) + 1
      if (!kind) fails.push(`${f}:${line}: a ⛔ error built as ${c}${via}, neither a Refusal nor a Transient: the boundary would retry it as a crash`)
    }
  }
  return { fails, forms, ctors, http, unreadable }
}

// ── 2. httpFailure ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function http(transform) {
  const { httpFailure, Refusal, Transient } = await importSource('src/lib/refusal.js', transform ? { transform } : {})
  const fails = []
  for (const [res, want] of [[null, Transient], [{ status: 0 }, Transient], [{ status: 500 }, Transient], [{ status: 503 }, Transient],
    [{ status: 408 }, Transient], [{ status: 429 }, Transient], [{ status: 404 }, Refusal], [{ status: 403 }, Refusal], [{ status: 400 }, Refusal]]) {
    const e = httpFailure(res, 'm')
    if (!(e instanceof want) || e.message !== 'm') fails.push(`httpFailure(${JSON.stringify(res)}) is not a ${want.name} carrying the site's message`)
  }
  return fails
}

// ── 3. the boundary, driven ─────────────────────────────────────────────────────────────────────────────────────────────
async function boundary(transform) {
  const fails = []
  // import.meta.env is Vite's; node has none, so the dev flag reads as a production build here (5. proves it is one).
  const B = (await importSource('src/components/R3FErrorBoundary.jsx', { transform: (s) => (transform ? transform(s) : s).replaceAll('import.meta.env.DEV', 'false') })).default
  const { Refusal } = await import(pathToFileURL(join(ROOT, 'src/lib/refusal.js')))
  const timers = [], was = { st: globalThis.setTimeout, err: console.error }
  globalThis.setTimeout = (fn, ms) => { timers.push(ms); return 0 }
  console.error = () => {}
  const drive = (err, retryCount) => {
    const b = new B({ name: 'Trees', children: 'CHILD' }); b.context = { lookId: 'a-town' }
    b.state = { ...b.state, retryCount, ...B.getDerivedStateFromError(err) }; b.setState = (u) => { b.state = { ...b.state, ...u } }
    b.componentDidCatch(err, {}); return b
  }
  try {
    failures.setState({ failed: {} }); timers.length = 0
    const b = drive(new Refusal('[Trees] ⛔ the anchors are refused'), 0)
    if (timers.length) fails.push('a Refusal is retried (a reset was scheduled): the same inputs give the same refusal, eight times')
    const got = failures.getState().failed['a-town/Trees']
    if (got?.kind !== 'refusal' || got.reason !== '[Trees] ⛔ the anchors are refused') fails.push(`a Refusal is not reported to the one sink under its town and layer (got ${JSON.stringify(got)})`)
    if (b.render() !== null) fails.push('a refused layer still renders its children')
    // an untyped crash: retried on every delay, then reported as given up
    failures.setState({ failed: {} }); timers.length = 0
    let n = 0
    for (; n < 50; n++) { drive(new Error('out of memory'), n); if (failures.getState().failed['a-town/Trees']) break }
    if (timers.length < 1) fails.push('an untyped crash is not retried: a transient during load would take the layer out for the session')
    if (failures.getState().failed['a-town/Trees']?.kind === 'refusal') fails.push('an untyped crash is reported as a refusal')
    const gave = failures.getState().failed['a-town/Trees']
    if (gave?.kind !== 'gave-up' || !gave.reason.includes('out of memory')) fails.push(`a crash the boundary gave up on is not reported, with its reason (got ${JSON.stringify(gave)}): it would end as a silent null`)
    if (gave && timers.length !== n) fails.push(`the boundary scheduled ${timers.length} retries but reported giving up on attempt ${n + 1}`)
  } finally { globalThis.setTimeout = was.st; console.error = was.err }
  return fails
}

// ── 5. the dev flag is gone from a build ────────────────────────────────────────────────────────────────────────────────
// `?refuse=<layer>` lets the operator see the banner work. Built as production (DEV false, minified, tree-shaken, as Vite
// builds) it must leave no trace; built as dev it must be there, so this cannot pass by the flag being absent everywhere.
function devFlag(transform) {
  const esbuild = require('esbuild'), src = (transform || ((s) => s))(sourceOf('src/components/R3FErrorBoundary.jsx'))
  const built = (dev) => esbuild.transformSync(src, { loader: 'jsx', format: 'esm', minify: true, treeShaking: true, define: { 'import.meta.env.DEV': String(dev) } }).code
  const fails = []
  if (!/refuse/.test(built(true))) fails.push('the dev flag ?refuse= is not in a dev build of R3FErrorBoundary.jsx (this check would prove nothing)')
  if (/refuse/.test(built(false))) fails.push('the dev flag ?refuse= survives a production build of R3FErrorBoundary.jsx: a public URL could make a layer throw')
  return fails
}

// ── 4. one sink, shown ──────────────────────────────────────────────────────────────────────────────────────────────────
function oneSink(files) {
  const fails = [], stores = files.filter(([, t]) => /\bcreate\(/.test(t) && /\bfailed:\s*\{\}/.test(t) && /\breport:/.test(t)).map(([f]) => f)
  if (stores.length !== 1 || stores[0] !== 'src/lib/failures.js') fails.push(`the failure sink is not one store at src/lib/failures.js (found: ${stores.join(', ') || 'none'})`)
  const get = (f) => files.find(([g]) => g === f)?.[1] || ''
  for (const f of ['src/components/R3FErrorBoundary.jsx', 'src/displays/DisplayBoundary.js'])
    if (!/from '\.\.\/lib\/failures\.js'/.test(get(f)) || !/useFailures\.getState\(\)\.report\(/.test(get(f))) fails.push(`${f} does not report to the one sink`)
  const stage = get('src/stage/StageApp.jsx')
  if (!/from '\.\.\/lib\/failures\.js'/.test(stage) || !/\{lookForkSlot\}\s*\{\/\*[^*]*\*\/\}\s*<FailuresBanner \/>/.test(stage)) fails.push('Stage does not show the sink at the top of its panel (<FailuresBanner /> after the look-fork slot)')
  return fails
}

async function verdict({ files: mutate, boundary: bt, http: ht, dev: dt } = {}) {
  let files = SRC.map(f => [f, readFileSync(join(ROOT, f), 'utf8')])
  if (mutate) files = mutate(files)
  const c = contract(files)
  const fails = [...c.fails, ...await http(ht), ...await boundary(bt), ...devFlag(dt), ...oneSink(files)]
  return { fails, c }
}

const { fails, c } = await verdict()
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
console.log(`⛔ errors in src: ${sum(c.ctors)} built by type (${Object.entries(c.ctors).map(([k, v]) => `${k} ${v}`).join(' · ')}) + ${c.http} by httpFailure · by form: ${Object.entries(c.forms).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`   blind spot: ${c.unreadable} untyped \`new Error(x)\` whose message is a call or a server's answer (not readable here)`)
if (fails.length) { console.log('⛔ a refusal can be swallowed:\n  · ' + fails.slice(0, VERBOSE ? Infinity : 25).join('\n  · ') + (fails.length > 25 && !VERBOSE ? `\n  … ${fails.length - 25} more (-v)` : '')); process.exitCode = 1 }
else console.log('✅ a refusal is never swallowed: every ⛔ error is a Refusal or a Transient; the boundary reports a Refusal at once and never retries it, retries a crash and reports giving up; one sink, shown by Stage')

if (process.argv.includes('--mutants')) {
  const swap = (rel, from, to) => (files) => files.map(([f, t]) => [f, f === rel ? (t.includes(from) ? t.replace(from, to) : `!! mutant anchor missing: ${from}`) : t])
  const mutants = [
    ['the boundary retries a Refusal', { boundary: (s) => s.replace('if (error instanceof Refusal) {', 'if (false) {') }],
    ['the boundary drops the report', { boundary: (s) => s.replace("useFailures.getState().report({ lookId, layer, kind: 'refusal', reason: reasonOf(error) })", '') }],
    ['the boundary never reports giving up', { boundary: (s) => s.replace("useFailures.getState().report({ lookId, layer, kind: 'gave-up', reason })", '') }],
    ['an untyped ⛔ throw returns', { files: swap('src/lib/failures.js', 'throw new Refusal(`[failures] ⛔', 'throw new Error(`[failures] ⛔') }],
    ['a ⛔ message held in a const returns untyped', { files: (fs) => [...fs, ['src/__mutant.js', "const msg = `[x] ⛔ held first`\nexport const f = () => { const e = new Error(msg); throw e }\n"]] }],
    ['a ⛔ error rejected untyped', { files: (fs) => [...fs, ['src/__mutant.js', "export const f = () => Promise.reject(new Error('[x] ⛔ rejected'))\n"]] }],
    ['httpFailure calls a 503 a Refusal', { http: (s) => s.replace('s >= 500 ||', '') }],
    ['a second sink returns', { files: (fs) => [...fs, ['src/displays/failures.js', "import { create } from 'zustand'\nexport default create((set) => ({ failed: {}, report: () => {} }))\n"]] }],
    ['the dev flag loses its gate', { dev: (s) => s.replace('const DEV_REFUSE = import.meta.env.DEV ?', 'const DEV_REFUSE = true ?').replace('if (import.meta.env.DEV && DEV_REFUSE', 'if (DEV_REFUSE') }],
    ['Stage drops the banner', { files: swap('src/stage/StageApp.jsx', '<FailuresBanner />', '') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const { fails: f } = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${VERBOSE && f.length ? ` (${f[0]})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
