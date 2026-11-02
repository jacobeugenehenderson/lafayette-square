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
 *      retry scheduled, and the layer renders nothing; a clean remount clears the entry; an untyped crash is retried on every delay and, when the last one
 *      fails, reported as given up with its reason. A retry that commits clean and stays up for the longest delay starts
 *      the table over; a town switch resets a refused boundary (it draws on the new town, and a refusal there is that
 *      town's); the first clean commit on a new town clears the layer's own entry there.
 *   7. A FAILED SCENE READ IS NOT REMEMBERED, AND ITS FAILURE IS THE ATTEMPT'S: <Displays> rendered through useSceneRead
 *      under a hook runner: a 503 refuses; a REMOUNT reads the file again and no render of it refuses; on a Look switch
 *      the next Look's first render shows nothing yet, never the last Look's failure.
 *   6. THE REVEAL HEARS IT: a boundary around a layer the reveal waits on (Town.jsx's PHYSICAL, read from source) marks
 *      that class failed on a Refusal and on giving up, so the gate says why the town is held; a clean remount clears
 *      a failure it wrote (never another producer's) with a mark of its own (the gate hears only new marks); every class has exactly one such boundary. Stage's
 *      banner is portalled above the splash (its zIndex over CanvasOverlay's, read from Town.jsx).
 *   5. NO URL FLAG: the boundary reads nothing from the page's address (the dev-only `?refuse=` was removed after its
 *      Stage validation).
 *   4. ONE SINK: exactly one store of failures under src/ (src/lib/failures.js); both boundaries report to it; Stage
 *      shows it at the top of its panel.
 *
 * Usage: node checks/claims-a-refusal-is-never-swallowed.mjs [--mutants] [-v]
 *   --mutants: the boundary retries a Refusal · the boundary drops the report · it never reports giving up · an untyped
 *   `⛔` throw returns · a ⛔ message held in a const returns untyped · httpFailure calls a 503 a Refusal · a second sink
 *   returns · a URL flag returns · Stage drops the banner · a reveal refusal or give-up
 *   unmarked · a clear the gate never hears · a clean remount clears a foreign failure · a reveal class with no boundary · the banner back under the splash
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
const { Refusal } = await import(pathToFileURL(join(ROOT, 'src/lib/refusal.js')))

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
async function boundary(transform, marksT) {
  const fails = []
  const B = (await importSource('src/components/R3FErrorBoundary.jsx', { ...(transform ? { transform } : {}),
    ...(marksT ? { redirect: { 'src/lib/startupMarks.js': { transform: marksT } } } : {}) })).default
  const M = marksT ? await importSource('src/lib/startupMarks.js', { transform: marksT }) : await import(pathToFileURL(join(ROOT, 'src/lib/startupMarks.js')))
  const { Refusal } = await import(pathToFileURL(join(ROOT, 'src/lib/refusal.js')))
  const timers = [], due = [], was = { st: globalThis.setTimeout, ct: globalThis.clearTimeout, err: console.error }
  globalThis.setTimeout = (fn, ms) => { timers.push(ms); due.push([fn, ms]); return due.length }
  globalThis.clearTimeout = (id) => { if (due[id - 1]) due[id - 1][0] = null }
  console.error = () => {}
  const drive = (err, retryCount, reveal) => {
    const b = new B({ name: 'Trees', reveal, children: 'CHILD' }); b.context = { lookId: 'a-town' }
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
    // a remount that draws clears the entry: a banner never outlives its cause
    const again = new B({ name: 'Trees', children: 'CHILD' }); again.context = { lookId: 'a-town' }; again.componentDidMount?.()
    if (failures.getState().failed['a-town/Trees']) fails.push('a refused layer that mounts again cleanly still shows as refused: the banner outlives its cause')
    // …and a mount that fails keeps its report
    failures.setState({ failed: {} }); const failing = drive(new Refusal('[Trees] ⛔ again'), 0); failing.componentDidMount?.()
    if (!failures.getState().failed['a-town/Trees']) fails.push('a layer that fails on mount clears its own report')
    // an untyped crash: retried on every delay, then reported as given up
    failures.setState({ failed: {} }); timers.length = 0
    let n = 0
    for (; n < 50; n++) { drive(new Error('out of memory'), n); if (failures.getState().failed['a-town/Trees']) break }
    if (timers.length < 1) fails.push('an untyped crash is not retried: a transient during load would take the layer out for the session')
    if (failures.getState().failed['a-town/Trees']?.kind === 'refusal') fails.push('an untyped crash is reported as a refusal')
    const gave = failures.getState().failed['a-town/Trees']
    if (gave?.kind !== 'gave-up' || !gave.reason.includes('out of memory')) fails.push(`a crash the boundary gave up on is not reported, with its reason (got ${JSON.stringify(gave)}): it would end as a silent null`)
    if (gave && timers.length !== n) fails.push(`the boundary scheduled ${timers.length} retries but reported giving up on attempt ${n + 1}`)
    // 6. the reveal hears it. A fresh class per run: marks are page-global and markFailed marks once.
    const cls = `trees-${Math.random().toString(36).slice(2)}`
    drive(new Refusal('[Trees] ⛔ the anchors are refused'), 0, cls)
    if (!String(M.failureOf(cls) || '').includes('the anchors are refused')) fails.push('a refused layer the reveal waits on does not mark its class failed: the gate holds the town in silence')
    const cls2 = `trees-${Math.random().toString(36).slice(2)}`
    for (let k = 0; k < 50 && !M.failureOf(cls2); k++) drive(new Error('out of memory'), k, cls2)
    if (!String(M.failureOf(cls2) || '').includes('out of memory')) fails.push('a reveal layer the boundary gave up on does not mark its class failed: the gate holds the town in silence')
    // prepared, then refused, then remounted clean: the failure goes, and the gate HEARS it (a new mark)
    const cls3 = `trees-${Math.random().toString(36).slice(2)}`
    M.markPrepared(cls3); drive(new Refusal('[Trees] ⛔ refused after it loaded'), 0, cls3)
    let heard = 0; const off = M.subscribeStartup(() => { heard++ })
    const clean = new B({ name: 'Trees', reveal: cls3, children: 'CHILD' }); clean.context = { lookId: 'a-town' }; clean.componentDidMount()
    await new Promise((r) => was.st(r, 50)); off()
    if (M.failureOf(cls3)) fails.push('a reveal layer that mounts again cleanly leaves its class failed: the town stays held after the fix')
    else if (!heard) fails.push('a reveal failure cleared on a clean remount writes no mark: the gate never hears it, and a class prepared before it failed stays held')
    // …but never a failure another producer wrote (the class is shared: a tree page that did not arrive)
    const cls4 = `trees-${Math.random().toString(36).slice(2)}`
    M.markFailed(cls4, 'a hero card page did not arrive')
    const other = new B({ name: 'InstancedTrees', reveal: cls4, children: 'CHILD' }); other.context = { lookId: 'a-town' }; other.componentDidMount()
    if (M.failureOf(cls4) !== 'a hero card page did not arrive') fails.push("a clean remount clears a reveal failure another producer wrote: the town would reveal with the hole the gate exists to prevent")
    // 2 · RECOVERY (2026-11-01). A retry that commits clean and stays up for the longest delay starts the table over.
    failures.setState({ failed: {} }); timers.length = 0; due.length = 0
    const r = new B({ name: 'Trees', children: 'CHILD' }); r.context = { lookId: 'a-town' }
    r.setState = (u) => { r.state = { ...r.state, ...(typeof u === 'function' ? u(r.state) : u) } }
    r.componentDidMount()
    const crash = (err) => { const prev = { ...r.state }; r.state = { ...r.state, ...B.getDerivedStateFromError(err) }; r.componentDidCatch(err, {}); r.componentDidUpdate({}, prev) }
    const commit = (u) => { const prev = { ...r.state }; r.setState(u); r.componentDidUpdate({}, prev) }
    crash(new Error('lost context')); const firstDelay = timers.at(-1)
    commit({ hasError: false, retryCount: 1 })                                   // the retry draws
    const stable = due.filter(([fn, ms]) => fn && ms > firstDelay).at(-1)
    if (!stable) fails.push('a retry that draws again schedules no recovery: retryCount only grows, and crashes spread over a session use up the table')
    else { stable[0](); stable[0] = null }
    crash(new Error('lost context again'))
    if (timers.at(-1) !== firstDelay) fails.push(`after a layer recovered, its next crash is retried at ${timers.at(-1)} ms, not the table's first ${firstDelay} ms: retryCount never resets`)
    // 2 · A TOWN SWITCH. Refused on A; the switch to B draws it again; B's own refusal is B's.
    failures.setState({ failed: {} })
    const t = new B({ name: 'Trees', children: 'CHILD' }); t.context = { lookId: 'a-town' }
    t.setState = (u) => { t.state = { ...t.state, ...(typeof u === 'function' ? u(t.state) : u) } }
    t.componentDidMount()
    { const prev = { ...t.state }; const err = new Refusal('[Trees] ⛔ refused on A'); t.state = { ...t.state, ...B.getDerivedStateFromError(err) }; t.componentDidCatch(err, {}); t.componentDidUpdate({}, prev) }
    failures.getState().report({ lookId: 'b-town', layer: 'Trees', kind: 'refusal', reason: 'an earlier refusal on B' })
    t.context = { lookId: 'b-town' }
    { const prev = { ...t.state }; t.componentDidUpdate({}, prev) }                 // the switch's update: it resets
    { const prev = { ...t.state, hasError: true }; t.componentDidUpdate({}, prev) }  // and the reset commits clean
    if (t.render() === null) fails.push('a layer refused on town A stays out on town B: a town switch does not reset the boundary, and B shows no entry for it (a silent absence)')
    if (failures.getState().failed['b-town/Trees']) fails.push("a town switch that resets the layer leaves its stale entry for the new town: the banner outlives its cause")
    { const prev = { ...t.state }; const err = new Refusal('[Trees] ⛔ refused on B'); t.state = { ...t.state, ...B.getDerivedStateFromError(err) }; t.componentDidCatch(err, {}); t.componentDidUpdate({}, prev) }
    if (failures.getState().failed['b-town/Trees']?.reason !== '[Trees] ⛔ refused on B') fails.push("a layer refused on town B after a switch is not reported under B")
    // …and back again, HEALTHY: refused on B → A (draws) → B (draws now): B's old entry goes (Zob, 2026-11-01)
    t.context = { lookId: 'a-town' }
    { const prev = { ...t.state }; t.componentDidUpdate({}, prev) }
    { const prev = { ...t.state, hasError: true }; t.componentDidUpdate({}, prev) }
    t.context = { lookId: 'b-town' }
    { const prev = { ...t.state }; t.componentDidUpdate({}, prev) }                 // healthy: no reset, one commit
    if (failures.getState().failed['b-town/Trees']) fails.push("a layer that refused on B, drew on A, and draws on B again leaves B's old entry: the banner stands while the layer draws")
  } finally { globalThis.setTimeout = was.st; globalThis.clearTimeout = was.ct; console.error = was.err }
  return fails
}

// ── 5. no URL makes a layer throw ───────────────────────────────────────────────────────────────────────────────────────
// The `?refuse=<layer>` flag that let Stage's banner be seen was removed after its validation (2026-10-31). The boundary
// reads nothing from the page's address: a URL that makes a layer throw is a footgun on a public site.
function noUrlFlag(files) {
  const src = files.find(([f]) => f === 'src/components/R3FErrorBoundary.jsx')?.[1] || ''
  return /\blocation\b|URLSearchParams/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))
    ? ['R3FErrorBoundary.jsx reads the page\'s address: a URL could make a layer throw'] : []
}

// ── 4. one sink, shown ──────────────────────────────────────────────────────────────────────────────────────────────────
function oneSink(files) {
  const fails = [], stores = files.filter(([, t]) => /\bcreate\(/.test(t) && /\bfailed:\s*\{\}/.test(t) && /\breport:/.test(t)).map(([f]) => f)
  if (stores.length !== 1 || stores[0] !== 'src/lib/failures.js') fails.push(`the failure sink is not one store at src/lib/failures.js (found: ${stores.join(', ') || 'none'})`)
  const get = (f) => files.find(([g]) => g === f)?.[1] || ''
  for (const f of ['src/components/R3FErrorBoundary.jsx', 'src/displays/DisplayBoundary.js'])
    if (!/from '\.\.\/lib\/failures\.js'/.test(get(f)) || !/useFailures\.getState\(\)\.report\(/.test(get(f))) fails.push(`${f} does not report to the one sink`)
  // 6. every class the reveal waits on has exactly one boundary carrying it, and no boundary names another
  const town = get('src/components/Town.jsx'), phys = town.match(/const PHYSICAL = \[([^\]]*)\]/)
  if (!phys) fails.push('Town.jsx declares no PHYSICAL: the classes the reveal waits on cannot be read')
  else {
    const classes = [...phys[1].matchAll(/'([^']+)'/g)].map(m => m[1]), carried = [...town.matchAll(/<R3FErrorBoundary\b[^>]*\breveal="([^"]+)"/g)].map(m => m[1])
    for (const c of classes) if (carried.filter(x => x === c).length !== 1) fails.push(`the reveal waits on "${c}", but ${carried.filter(x => x === c).length} boundaries carry it: a refusal there holds the town in silence`)
    for (const c of carried) if (!classes.includes(c)) fails.push(`a boundary carries reveal="${c}", which the reveal does not wait on`)
  }
  const overlayZ = Number(town.match(/function CanvasOverlay[\s\S]*?zIndex: '(\d+)'/)?.[1]), bannerZ = Number(get('src/stage/StageApp.jsx').match(/const FAILURES_Z = (\d+)/)?.[1])
  const fb = get('src/stage/StageApp.jsx').slice(get('src/stage/StageApp.jsx').indexOf('function FailuresBanner'), get('src/stage/StageApp.jsx').indexOf('function DisplaysSection'))
  if (!(overlayZ > 0) || !(bannerZ > overlayZ) || !/createPortal\(/.test(fb) || !/zIndex: FAILURES_Z/.test(fb) || !/document\.body/.test(fb))
    fails.push(`Stage's banner is not portalled above the splash (overlay zIndex ${overlayZ}, banner ${bannerZ}): a town held on its emblem hides why`)
  const stage = get('src/stage/StageApp.jsx')
  if (!/from '\.\.\/lib\/failures\.js'/.test(stage) || !/\{lookForkSlot\}\s*\{\/\*[^*]*\*\/\}\s*<FailuresBanner \/>/.test(stage)) fails.push('Stage does not show the sink at the top of its panel (<FailuresBanner /> after the look-fork slot)')
  return fails
}

// ── 7. a failed scene read is not remembered, and its failure belongs to the attempt ─────────────────────────────────────
// useSceneJson.js#fetchSceneOnce kept a failed read's promise (resolved to null) in its cache, and production passes no
// reread: a 503 at boot was "no scene" for the session (Zob's note, b6ef3b47). And a failure kept by the MODULE was read at
// a remount's first render, before the new attempt, so a display refused a scene that then read (Zob, 2026-11-01).
// RUN, not read: <Displays> (src/displays/Displays.jsx, its JSX compiled here) is rendered through useSceneRead under a
// minimal hook runner (state, memo, effects after render, a re-render on a state change, cleanup on unmount). What it
// renders is read: a <Refuse> child (the refusal DisplayBoundary would report) or the plugin's <Suspense>.
function hookRunner() {
  let cur = null
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
  globalThis.__hooks = {
    useState(init) { const i = cur, k = i.k++; if (!(k in i.s)) i.s[k] = init; return [i.s[k], (v) => { i.s[k] = v; i.dirty = true }] },
    useMemo(f, deps) { const i = cur, k = i.k++, m = i.m[k]; if (m && same(m.deps, deps)) return m.v; const v = f(); i.m[k] = { deps, v }; return v },
    useEffect(f, deps) { const i = cur, k = i.k++, e = i.e[k]; if (e && same(e.deps, deps)) return; i.after.push(() => { e?.cleanup?.(); i.e[k] = { deps, cleanup: f() } }) },
  }
  return (render) => {
    const i = { s: {}, m: {}, e: {}, k: 0, after: [], dirty: false, outs: [] }
    const go = (props) => { cur = i; i.k = 0; i.dirty = false; const out = render(props); cur = null; i.outs.push(out); for (const f of i.after.splice(0)) f(); return out }
    return { outs: i.outs, render: go,
      async settle(props) { for (let n = 0; n < 20; n++) { await new Promise((r) => setTimeout(r, 0)); if (i.dirty) go(props) } },
      unmount() { for (const e of Object.values(i.e)) e.cleanup?.() } }
  }
}
// useSceneJson.js from its cache down, its imports supplied: the hooks, slabFetch and the town's shot are the runner's.
const HOOK_PREFIX = ['useEffect', 'useMemo', 'useState'].map(h => `const ${h} = (...a) => globalThis.__hooks.${h}(...a)`).join('\n') +
  "\nconst slabFetch = (...a) => globalThis.__slabFetch(...a)\nconst useTownShot = () => null\nimport { shotKeyForViewMode, resolveShotScene } from './shotScene.js'\nimport { sceneFor } from './sceneFor.js'\nimport { Refusal, Transient, httpFailure } from './refusal.js'"
const HOOK_DEV = (t) => t.replace(/import\.meta\.env\.DEV/g, 'false')
async function sceneRead(transform, displaysT) {
  const fails = []
  const { transformSync } = require('esbuild')
  const jsx = (t) => transformSync(displaysT ? displaysT(t) : t, { loader: 'jsx', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__F' }).code
  // The hook, from its cache down, its imports supplied (the hooks, slabFetch and the town's shot are the runner's)…
  const H = await importSource('src/lib/useSceneJson.js', { span: { from: 'const _cache = new Map()' }, prefix: HOOK_PREFIX,
    transform: (t) => HOOK_DEV(transform ? transform(t) : t) })
  globalThis.__useSceneRead = H.useSceneRead
  // …and Displays and Refuse (Displays to the file's end) reading it, with a planted plugin (a Renderer that draws
  // nothing): the check judges refusal against display, never the plugin, so the real one (a lazy LightShow) is not imported.
  const D = await importSource('src/displays/Displays.jsx', { span: { from: 'export default function Displays(' },
    prefix: "import { createElement as __h, Fragment as __F, Suspense } from 'react'\nimport DisplayBoundary from './DisplayBoundary.js'\nimport { Refusal, Transient } from '../lib/refusal.js'\nimport { displayChannelsFor } from './showChannel.js'\nconst useSceneRead = (...a) => globalThis.__useSceneRead(...a)\nconst PLUGINS = { 'light-show': { label: 'Light Show', attaches: ['setPiece'], Renderer: () => null } }",
    transform: jsx })
  const mount = hookRunner(), was = console.warn
  const town = { displays: [{ id: 'd1', kind: 'light-show', attach: 'setPiece' }], contentRoot: '' }
  const props = (lookId) => ({ town, lookId, attach: 'setPiece', calendar: [], drawerSource: 'published' })
  // Fresh Look ids per run: the same module text is the same module instance (its cache outlives one verdict).
  const tag = Math.random().toString(36).slice(2), A = `a-${tag}`, X = `x-${tag}`, Y = `y-${tag}`
  const shown = (out) => !out ? 'nothing (not yet)' : out[0]?.props?.children?.type?.name === 'Refuse' ? 'a refusal' : 'the display'
  let calls = 0
  console.warn = () => {}
  try {
    // a 503: the display refuses, by name
    globalThis.__slabFetch = async () => { calls++; return { ok: false, status: 503 } }
    const a = mount(D.default); a.render(props(A)); await a.settle(props(A)); a.unmount()
    if (shown(a.outs.at(-1)) !== 'a refusal') fails.push(`a scene read that answered 503 renders ${shown(a.outs.at(-1))}, not a refusal (the check cannot reach what follows)`)
    // the same Look REMOUNTED, the file now reads: read again, and no render of the new mount refuses
    globalThis.__slabFetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ displays: { d1: { animated: 'tod', values: {} } } }) } }
    const b = mount(D.default); b.render(props(A)); await b.settle(props(A)); b.unmount()
    if (calls !== 2) fails.push(`a remount after a failed scene read made ${calls - 1} read(s), not 1: the failure is remembered (useSceneJson.js#fetchSceneOnce)`)
    const seen = b.outs.map(shown)
    if (seen.includes('a refusal')) fails.push(`a remount after a failed scene read renders a refusal (${seen.join(' → ')}): a failure from an earlier attempt refuses a scene that reads`)
    if (seen.at(-1) !== 'the display') fails.push(`a remount whose scene reads ends at ${seen.at(-1)}, not the display`)
    // a Look switch in one mount: the last Look's failure is never this Look's
    globalThis.__slabFetch = async () => ({ ok: false, status: 503 })
    const c = mount(D.default); c.render(props(X)); await c.settle(props(X))
    globalThis.__slabFetch = () => new Promise(() => {})
    const first = shown(c.render(props(Y))); c.unmount()
    if (first !== 'nothing (not yet)') fails.push(`on a switch from a Look whose read failed, the next Look's first render shows ${first}: another Look's failure`)
  } finally { console.warn = was; delete globalThis.__slabFetch }
  return fails
}

async function verdict({ files: mutate, boundary: bt, http: ht, marks: mt, scene: st, displays: dt } = {}) {
  let files = SRC.map(f => [f, readFileSync(join(ROOT, f), 'utf8')])
  if (mutate) files = mutate(files)
  const c = contract(files)
  const fails = [...c.fails, ...await http(ht), ...await boundary(bt, mt), ...await sceneRead(st, dt), ...noUrlFlag(files), ...oneSink(files)]
  return { fails, c }
}

const { fails, c } = await verdict()
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
console.log(`⛔ errors in src: ${sum(c.ctors)} built by type (${Object.entries(c.ctors).map(([k, v]) => `${k} ${v}`).join(' · ')}) + ${c.http} by httpFailure · by form: ${Object.entries(c.forms).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`   blind spot: ${c.unreadable} untyped \`new Error(x)\` whose message is a call or a server's answer (not readable here)`)
if (fails.length) { console.log('⛔ a refusal can be swallowed:\n  · ' + fails.slice(0, VERBOSE ? Infinity : 25).join('\n  · ') + (fails.length > 25 && !VERBOSE ? `\n  … ${fails.length - 25} more (-v)` : '')); process.exitCode = 1 }
else console.log('✅ a refusal is never swallowed: every ⛔ error is a Refusal or a Transient; the boundary reports a Refusal at once and never retries it, retries a crash and reports giving up; one sink, shown by Stage')

if (process.argv.includes('--mutants')) {
  // ⛔ A mutant whose anchor has gone replaces nothing and "survives" for the wrong reason: refuse it by name instead.
  const must = (from, to) => (s) => { if (!s.includes(from)) throw new Refusal(`[refusal check] ⛔ mutant anchor gone: ${from.slice(0, 80)}`); return s.replace(from, to) }
  const swap = (rel, from, to) => (files) => files.map(([f, t]) => [f, f === rel ? must(from, to)(t) : t])
  const mutants = [
    ['the boundary retries a Refusal', { boundary: must('if (error instanceof Refusal) {', 'if (false) {') }],
    ['the boundary drops the report', { boundary: must("useFailures.getState().report({ lookId, layer, kind: 'refusal', reason: reasonOf(error) })", '') }],
    ['retryCount never resets', { boundary: must('this.setState({ retryCount: 0 }) }, RETRY_DELAYS_MS.at(-1))', 'void 0 }, RETRY_DELAYS_MS.at(-1))') }],
    ['a town switch keeps the boundary down', { boundary: must('if (this.state.hasError || this.state.retryCount) { this.setState({ hasError: false, retryCount: 0 }); return }', '') }],
    ['a healthy switch owes no clear', { boundary: must('    if (this._owesClear && !this.state.hasError) { this._owesClear = false; this._clearOwn() }\n', '') }],
    ['a clean remount leaves the stale entry', { boundary: must("    useFailures.getState().clear(lookId, layer)\n", '') }],
    ['the boundary never reports giving up', { boundary: must("useFailures.getState().report({ lookId, layer, kind: 'gave-up', reason })", '') }],
    ['an untyped ⛔ throw returns', { files: swap('src/lib/failures.js', 'throw new Refusal(`[failures] ⛔', 'throw new Error(`[failures] ⛔') }],
    ['a ⛔ message held in a const returns untyped', { files: (fs) => [...fs, ['src/__mutant.js', "const msg = `[x] ⛔ held first`\nexport const f = () => { const e = new Error(msg); throw e }\n"]] }],
    ['a ⛔ error rejected untyped', { files: (fs) => [...fs, ['src/__mutant.js', "export const f = () => Promise.reject(new Error('[x] ⛔ rejected'))\n"]] }],
    ['httpFailure calls a 503 a Refusal', { http: must('s >= 500 ||', '') }],
    ['a second sink returns', { files: (fs) => [...fs, ['src/displays/failures.js', "import { create } from 'zustand'\nexport default create((set) => ({ failed: {}, report: () => {} }))\n"]] }],
    ['a URL flag returns', { files: swap('src/components/R3FErrorBoundary.jsx', 'export default class R3FErrorBoundary', "const FLAG = new URLSearchParams(globalThis.location?.search || '').get('refuse')\nexport default class R3FErrorBoundary") }],
    ['a reveal refusal left unmarked', { boundary: must("if (this.props.reveal) markFailed(this.props.reveal, `${layer} refused: ${reasonOf(error)}`)", '') }],
    ['a reveal give-up left unmarked', { boundary: must("if (this.props.reveal) markFailed(this.props.reveal, `${layer} ${reason}`)", '') }],
    ['a clear the gate never hears', { marks: must("  performance.mark(MARK_PREFIX + 'cleared:' + id)\n", '') }],
    ['a clean remount clears a foreign failure', { boundary: must("if (this.props.reveal && String(failureOf(this.props.reveal) ?? '').startsWith(`${layer} `)) clearFailed(this.props.reveal)", 'if (this.props.reveal) clearFailed(this.props.reveal)') }],
    ['a reveal class with no boundary', { files: swap('src/components/Town.jsx', '<R3FErrorBoundary name="InstancedTrees" reveal="trees">', '<R3FErrorBoundary name="InstancedTrees">') }],
    ['the banner back under the splash', { files: swap('src/stage/StageApp.jsx', 'const FAILURES_Z = 400', 'const FAILURES_Z = 10') }],
    ['the banner back in the panel', { files: swap('src/stage/StageApp.jsx', 'return createPortal(', 'return ((el) => el)(') }],
    ['a failed scene read stays cached', { scene: must('      _cache.delete(key)\n', '') }],
    ['a Look switch shows the last Look\'s failure', { scene: must('failure = held?.lookId === lookId ? held.failure : null', 'failure = held?.failure ?? null') }],
    ['a display refuses on a module record of the failure', { scene: (t) => must('const p = slabFetch(', 'const p = slabFetch(')(t).replace(/\.catch\(e => \{\n/, '.catch(e => { globalThis.__lastFail = e\n') + '\nexport const lastFail = () => globalThis.__lastFail',
      displays: must('const { scene, failure } = useSceneRead(lookId), failed', "const { scene } = useSceneRead(lookId), failure = globalThis.__lastFail, failed") }],
    ['Stage drops the banner', { files: swap('src/stage/StageApp.jsx', '<FailuresBanner />', '') }],
  ]
  let bad = 0
  // A mutant is red only on a failure the baseline does not already have: a red baseline must not paint every mutant red.
  const had = new Set(fails)
  for (const [name, m] of mutants) { const f = (await verdict(m)).fails.filter(x => !had.has(x)); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${VERBOSE && f.length ? ` (${f[0]})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
