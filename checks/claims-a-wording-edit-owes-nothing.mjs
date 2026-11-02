#!/usr/bin/env node
/**
 * "DOES A REWORDED REFUSAL OWE NOTHING, AND DOES EVERYTHING ELSE STILL OWE?" (Boz, 2026-11-01: the chain-names pass reworded one
 * `new Refusal(…)` in streetProfiles.js and every town's Foundry owed all 18 steps. A key that misses a real code change is worse
 * than a false stale, so the exemption is as narrow as the census below can prove.)
 *   A. THE JUDGE, RUN — pour-code.mjs#executedHash (x2) on planted sources: the literal text inside `new Refusal(…)` /
 *      `new <X>Error(…)` owes nothing; a logic edit, a `${…}` inside the message, a renamed callee, a returned string and a
 *      console line (OUTPUT a step parses: promote-ribbons' PROMOTE-DIFF) each owe.
 *   B. THE BRIDGE, RUN — contentChanged on a planted git (gitRead): an x1 or raw-bytes record of a version git holds is judged by
 *      that version's x2 (a message-only edit since owes nothing; a logic edit owes); a record git does not hold owes, named as
 *      expected; a git failure owes, named as a git failure, never as "not found".
 *   C. THE CENSUS, READ — over every file the Foundry's steps run (the pour closure, and the import closure of every step script
 *      the bake route and pourSteps.mjs declare by `join(here|HERE, …)` / `join(REPO_ROOT, <dir>, …)`):
 *      (i)  every `.message` read outside a message sink (a message callee's or console's arguments, a throw, `e.message =`), and
 *      (ii) every probe (a regex literal, or a literal handed to includes/startsWith/…/exec) in a STEP-OUTPUT PARSER (a function
 *           handed as `onLine`, the function that calls `onLine`, and the functions they call) that matches any exempted text,
 *      carries `// message-flow(<h>): <where it goes>` on its line or the line above, where <h> is the first 8 hex of the sha1 of
 *      the enclosing function's tokens (comments stripped). Missing → red; <h> stale → red (the function changed since the flow
 *      was reviewed); an annotation with nothing left to vouch for → red. ⛔ The annotation is pinned to the code: it cannot
 *      outlive what it describes (Zob, 2026-11-02).
 * Usage: node checks/claims-a-wording-edit-owes-nothing.mjs [--mutants]
 *   --mutants: every string exempted · console exempted · a ${} exempted · the bridge dropped · a git failure read as not found ·
 *   a planted .message store · an annotated function edited, not re-pinned · an <h> copied from another function · an annotation
 *   removed · the refusal relay unannotated · an annotation with nothing to vouch for. Each must turn it red.
 */
import { parse } from '@babel/parser'
import { createHash } from 'node:crypto'
import { importSource, sourceOf } from './_importSource.mjs'

const loadJudge = (transform) => importSource('cartograph/pour-code.mjs', { span: { from: '// ⭐ CODE IS JUDGED BY WHAT RUNS', to: "/** The bridge's one way into git history" }, ...(transform ? { transform } : {}),
  prefix: "import { parse } from '@babel/parser'\nimport { createHash } from 'node:crypto'\nimport { relative, join } from 'node:path'\n" +
    "const REPO_ROOT = '/r'\nconst _fs = () => globalThis.__fs\n" +
    "const statSync = (f) => { if (!(f in _fs().files)) throw new Error('ENOENT ' + f); return { mtimeMs: _fs().gen, size: _fs().files[f].length, isDirectory: () => false } }\n" +
    "const readFileSync = (f, enc) => { if (!(f in _fs().files)) throw new Error('ENOENT ' + f); return enc ? _fs().files[f] : Buffer.from(_fs().files[f], 'utf-8') }\n" +
    "const readdirSync = () => []\nconst gitRead = (args, input) => globalThis.__git(args, input)" })

// ── A ──
const REF = "export function seedOf(chain) {\n  if (!chain.seed) throw new Refusal(`⛔ pourMeasureOf: \"${chain.name}\" (${chain.id}) has no seed — re-pour the skeleton`)\n" +
  "  if (chain.bad) throw new TypeError('bad chain: ' + chain.id)\n  console.log(`PROMOTE-DIFF ${JSON.stringify(chain.diff)}`)\n  return ['(no record of what the last pour read)']\n}\n"
async function judge(transform) {
  const fails = [], J = await loadJudge(transform), h = J.executedHash
  const same = [['the Refusal reworded', REF.replace('re-pour the skeleton', 're-run the Skeleton')], ['a TypeError reworded', REF.replace("'bad chain: '", "'not a chain: '")]]
  const owed = [['a logic edit', REF.replace('if (!chain.seed)', 'if (!chain.seed && chain.x)')], ['a ${…} in the message', REF.replace('(${chain.id})', '(${chain.name})')],
    ['the callee renamed', REF.replace('new Refusal(', 'new Notice(')], ['a returned string', REF.replace('the last pour read', 'the last Foundry run read')],
    ["a console line a step's output parser reads", REF.replace('PROMOTE-DIFF ', 'PROMOTE DIFF ')]]
  for (const [what, src] of same) if (h(src) !== h(REF)) fails.push(`A · ${what} owes a run (a refusal's wording is not what runs)`)
  for (const [what, src] of owed) if (h(src) === h(REF)) fails.push(`A · ${what} owes nothing (the key misses a real change)`)
  if (!h(REF).startsWith('x2:') || !J.executedHashX1(REF).startsWith('x1:') || J.executedHashX1(REF) === J.executedHashX1(same[0][1])) fails.push('A · the x1 form (kept to read older records) is not the full token stream')
  return { fails, J }
}

// ── B ──
async function bridge(J) {
  const fails = [], sha1 = (t) => createHash('sha1').update(t).digest('hex')
  const V1 = REF, V2 = REF.replace('re-pour the skeleton', 're-run the Skeleton'), V3 = REF.replace('if (!chain.seed)', 'if (!chain.seed && chain.x)')
  const blobs = { [sha1('b1')]: V1, [sha1('b0')]: '// an older version\n' + V1.replace('seedOf', 'seedOfOld') }
  let gitFails = false
  globalThis.__git = (args, input) => {
    if (gitFails) throw new Error('fatal: not a git repository')
    if (args[0] === 'log') return Buffer.from(Object.keys(blobs).map((b) => `:100644 100644 ${'0'.repeat(39)}1 ${b} M\ta.js`).join('\n'))
    if (args[0] === 'cat-file') return Buffer.concat(input.trim().split('\n').map((b) => { const t = Buffer.from(blobs[b], 'utf-8'); return Buffer.concat([Buffer.from(`${b} blob ${t.length}\n`), t, Buffer.from('\n')]) }))
    throw new Error(`the bridge asked git for ${args[0]}`)
  }
  let gen = 0
  // each case its own file: the bridge memoises a file's history, so a reused name would never reach git
  const judgeNow = (now, rec, name = 'a.js') => { globalThis.__fs = { files: { [`/r/${name}`]: now }, gen: ++gen }; return J.contentChanged({ [name]: rec }, [`/r/${name}`]) }
  try {
    let c = judgeNow(V2, J.executedHashX1(V1))
    if (c.length) fails.push(`B · an x1 record of a version git holds, reworded since, owes (${JSON.stringify(c)})`)
    c = judgeNow(V2, sha1(V1))
    if (c.length) fails.push(`B · a raw-bytes record of a version git holds, reworded since, owes (${JSON.stringify(c)})`)
    c = judgeNow(V3, J.executedHashX1(V1))
    if (JSON.stringify(c) !== '["a.js"]') fails.push(`B · a logic edit since an x1 record is not owed by name (${JSON.stringify(c)})`)
    c = judgeNow(V2, J.executedHashX1('export const never = 1\n'))
    if (c.length !== 1 || !/a version git does not hold/.test(c[0])) fails.push(`B · a record git does not hold is not owed and named (${JSON.stringify(c)})`)
    gitFails = true
    c = judgeNow(V2, J.executedHashX1(V1), 'b.js')
    if (c.length !== 1 || !/b\.js \(its older record could not be read from git: fatal/.test(c[0])) fails.push(`B · a git failure is not owed as a git failure (${JSON.stringify(c)})`)
  } finally { delete globalThis.__git; delete globalThis.__fs }
  return fails
}

// ── C ──
const PIN = /message-flow\(([0-9a-f]{8})\):\s*\S/
const isMsgNew = (n) => n?.type === 'NewExpression' && n.callee?.type === 'Identifier'
const isConsole = (n) => n?.type === 'CallExpression' && n.callee?.type === 'MemberExpression' && n.callee.object?.name === 'console'
const PROBE_METHODS = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'match', 'matchAll', 'test', 'exec', 'search', 'replace', 'split'])
const parseOf = (src) => parse(src, { sourceType: 'module', allowHashBang: true, errorRecovery: false, tokens: true })
const pinOf = (ast, src, fn) => createHash('sha1').update(ast.tokens.filter((t) => t.start >= fn.start && t.end <= fn.end && t.type !== 'CommentLine' && t.type !== 'CommentBlock').map((t) => src.slice(t.start, t.end)).join(' ')).digest('hex').slice(0, 8)
function walk(n, visit, anc = []) {
  if (!n || typeof n.type !== 'string') return
  visit(n, anc)
  for (const k in n) { if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue
    const v = n[k], next = [...anc, { n, k }]
    if (Array.isArray(v)) for (const c of v) walk(c, visit, next); else if (v && typeof v === 'object') walk(v, visit, next) }
}
const IS_FN = /Function|Method/
const fnOf = (anc) => [...anc].reverse().find((x) => IS_FN.test(x.n.type))?.n
/** The name of the nearest NAMED enclosing function (an anonymous callback names the function around it). */
const nameOf = (anc) => {
  for (let i = anc.length - 1; i >= 0; i--) {
    const n = anc[i].n, p = anc[i - 1]?.n
    if (!IS_FN.test(n.type)) continue
    if (n.id?.name) return n.id.name
    if (n.key?.name) return n.key.name
    if (p?.type === 'VariableDeclarator' && p.id?.name) return p.id.name
    if (p?.type === 'ObjectProperty' && p.key?.name) return p.key.name
  }
  return '(top level)'
}

/** The files the Foundry's steps run, read off the bake route and pourSteps.mjs → repo-relative paths. */
async function stepFiles(read) {
  const C = await importSource('cartograph/pour-code.mjs', { span: { functions: ['importClosure'] }, suffix: '\nexport { importClosure }',
    prefix: "import { readFileSync, existsSync } from 'node:fs'\nimport { join, dirname } from 'node:path'" })
  const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  const serve = read('cartograph/serve.js'), ps = read('cartograph/pourSteps.mjs'), pc = read('cartograph/pour-code.mjs')
  const a = serve.indexOf("(m = path.match(/^\\/looks\\/([^/]+)\\/bake$/))"), route = serve.slice(a, serve.indexOf('// the plan ends here', a))
  if (a < 0 || route.length < 1000) throw new Error('[census] the bake route is not where this check reads it: re-aim')
  const entry = /export const POUR_ENTRY = join\(HERE, '([^']+)'\)/.exec(pc)?.[1], stop = /export const TOWN_REGISTRY = join\(REPO_ROOT, ([^)]+)\)/.exec(pc)?.[1]
  if (!entry || !stop) throw new Error('[census] pour-code.mjs names no POUR_ENTRY / TOWN_REGISTRY: re-aim')
  const roots = new Set([`${ROOT}/cartograph/${entry}`])
  for (const src of [route, ps]) {
    for (const m of src.matchAll(/join\((?:here|HERE), '([^']+\.[mc]?js)'\)/g)) roots.add(`${ROOT}/cartograph/${m[1]}`)
    for (const m of src.matchAll(/join\(REPO_ROOT, '([^']+)', '([^']+\.[mc]?js)'\)/g)) roots.add(`${ROOT}/${m[1]}/${m[2]}`)
  }
  const stopAt = [`${ROOT}/${stop.split(',').map((s) => s.trim().replace(/'/g, '')).join('/')}`]
  return { roots: roots.size, files: C.importClosure([...roots], { stopAt }).filter((f) => /\.[mc]?js$/.test(f)).map((f) => f.slice(ROOT.length + 1)).sort() }
}

async function census(J, read = sourceOf) {
  const fails = [], { files, roots } = await stepFiles(read)
  if (roots < 15 || files.length < 100) fails.push(`C · the census reached ${roots} step roots and ${files.length} files: the declarations it reads have moved`)
  const parsed = new Map()
  for (const f of files) { const src = read(f); try { parsed.set(f, { src, ast: parseOf(src) }) } catch (e) { fails.push(`C · ${f} cannot be read as JavaScript (${e.message.split('\n')[0]})`) } }
  const texts = []
  for (const [, { src, ast }] of parsed) for (const [s, e] of J.messageTextRanges(ast)) texts.push(src.slice(s, e).replace(/^[`'"}]|(\$\{|[`'"])$/g, ''))
  const owes = []   // { f, fn, name, line, what }
  // (i) .message outside a message sink
  for (const [f, { ast }] of parsed) walk(ast.program, (n, anc) => {
    if (n.type !== 'MemberExpression' || n.computed || n.property?.name !== 'message') return
    const last = anc[anc.length - 1]
    if (last?.n.type === 'AssignmentExpression' && last.k === 'left') return
    if (anc.some((x) => ((isMsgNew(x.n) && /^(Refusal|\w*Error)$/.test(x.n.callee.name)) || isConsole(x.n)) && x.k === 'arguments' || x.n.type === 'ThrowStatement')) return
    owes.push({ f, fn: fnOf(anc), name: nameOf(anc), line: n.loc.start.line, what: 'reads .message outside a message' })
  })
  // (ii) step-output parsers' probes that match an exempted text
  const parsers = []   // [file, fn node]
  const topFns = new Map()   // name → [file, fn node] across serve.js and pourSteps.mjs
  for (const f of ['cartograph/serve.js', 'cartograph/pourSteps.mjs']) {
    const { ast } = parsed.get(f) ?? { ast: parseOf(read(f)) }; if (!parsed.has(f)) parsed.set(f, { src: read(f), ast })
    for (const s of ast.program.body) { const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s
      if (d?.type === 'FunctionDeclaration') topFns.set(d.id.name, [f, d])
      if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (IS_FN.test(v.init?.type || '')) topFns.set(v.id.name, [f, v.init]) }
    walk(ast.program, (n, anc) => {
      if (n.type === 'ObjectProperty' && n.key?.name === 'onLine' && IS_FN.test(n.value?.type)) parsers.push([f, n.value, `${nameOf(anc)} › onLine`])
      if (n.type === 'CallExpression' && /onLine/.test(n.callee?.property?.name || n.callee?.name || '') && fnOf(anc)) parsers.push([f, fnOf(anc), nameOf(anc)])
      if (n.type === 'OptionalCallExpression' && n.callee?.property?.name === 'onLine' && fnOf(anc)) parsers.push([f, fnOf(anc), nameOf(anc)])
    })
  }
  for (let i = 0; i < parsers.length; i++) walk(parsers[i][1], (n) => { if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') && n.callee?.type === 'Identifier' && topFns.has(n.callee.name) && !parsers.some((p) => p[1] === topFns.get(n.callee.name)[1])) parsers.push([...topFns.get(n.callee.name), n.callee.name]) })
  if (!parsers.length) fails.push('C · no step-output parser found (no `onLine`): the census reads nothing')
  for (const [f, fnNode, pname] of parsers) {
    const { ast } = parsed.get(f)
    walk(fnNode, (n, anc) => {
      let probe = null
      if (n.type === 'RegExpLiteral') { try { const re = new RegExp(n.pattern, n.flags.replace(/[gy]/g, '')); probe = (t) => re.test(t) } catch { return } }
      if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') && PROBE_METHODS.has(n.callee?.property?.name) && n.arguments[0]?.type === 'StringLiteral') { const s = n.arguments[0].value; probe = (t) => t.includes(s) }
      if (!probe) return
      const hit = texts.find(probe)
      if (hit !== undefined) owes.push({ f, fn: fnOf([{ n: fnNode }, ...anc]) ?? fnNode, name: pname, line: n.loc.start.line, what: `parses step output with a probe that matches a refusal's words ("${hit.slice(0, 40)}")` })
    }, [])
  }
  // every owed site carries a pin to its function; every pin vouches for a site
  const used = new Set()
  for (const o of owes) {
    const { src, ast } = parsed.get(o.f), want = pinOf(ast, src, o.fn)
    const c = ast.comments.find((c) => PIN.test(c.value) && (c.loc.start.line === o.line || c.loc.end.line === o.line - 1) && c.start >= o.fn.start && c.end <= o.fn.end)
    if (!c) { fails.push(`C · ${o.f}#${o.name}:${o.line} ${o.what}, with no message-flow annotation: say where it goes — // message-flow(${want}): <where>`); continue }
    used.add(c)
    if (PIN.exec(c.value)[1] !== want) fails.push(`C · ${o.f}#${o.name} changed since its message-flow was reviewed (pinned ${PIN.exec(c.value)[1]}, now ${want}): re-read where the message goes, then re-pin`)
  }
  for (const [f, { ast }] of parsed) for (const c of ast.comments) if (PIN.test(c.value) && !used.has(c)) fails.push(`C · ${f}:${c.loc.start.line} carries a message-flow annotation with nothing to vouch for`)
  return { fails, owes: owes.length }
}

// ── D: the wiring, READ ──
function wiring(pc) {
  const fails = []
  if (!/else if \(CODE_FILE\.test\(f\)\) \{ try \{ out = executedHash\(readFileSync\(f, 'utf-8'\)\) \}/.test(pc)) fails.push('D · contentHash does not hash code with executedHash (x2)')
  if (!/export const executedHash = \(src\) => tokenHash\(src, EXEC_PREFIX, true\)/.test(pc) || !/export const EXEC_PREFIX = 'x2:'/.test(pc)) fails.push('D · the recorded judge is not x2')
  if (!/OLDER_FORM\(was\) && abs\.has\(p\)\) \{\s*const then = oldRecordRunsAs\(abs\.get\(p\), was\)/.test(pc)) fails.push('D · contentChanged does not bridge an older record through oldRecordRunsAs')
  const g = pc.slice(pc.indexOf('function gitRead('), pc.indexOf('\n}\n', pc.indexOf('function gitRead(')))
  if (!/execFileSync\('git', \['-C', REPO_ROOT, \.\.\.args\]/.test(g)) fails.push("D · gitRead is not the bridge's one way into git")
  const calls = [...pc.matchAll(/gitRead\(\['([a-z-]+)'/g)].map((m) => m[1])
  if (!calls.length || calls.some((c) => !['log', 'cat-file'].includes(c))) fails.push(`D · the bridge asks git for more than log and cat-file (${calls.join(', ')})`)
  return fails
}

async function verdict(m = {}) {
  const { fails, J } = await judge(m.judge)
  const C = await census(J, m.read ?? sourceOf)
  return [...fails, ...await bridge(J), ...C.fails, ...wiring(m.pc ? m.pc(sourceOf('cartograph/pour-code.mjs')) : sourceOf('cartograph/pour-code.mjs'))]
}

const fails = await verdict()
for (const f of fails) console.log(`⛔ ${f}`)
console.log(fails.length ? '\n⛔ RED — a wording edit owes a run, or a real change owes nothing, or a message-flow is unreviewed' : '✅ a reworded refusal owes nothing; logic, a ${} in a message, a console line and a returned string each owe; older records are bridged; every message read outside a message is reviewed and pinned')
let bad = fails.length ? 1 : 0
if (process.argv.includes('--mutants')) {
  const must = (from, to) => (t) => { if (!t.includes(from)) throw new Error(`[mutant] anchor gone: ${from.slice(0, 70)}`); return t.replace(from, to) }
  const reading = (rel, change) => (r) => (r === rel ? change(sourceOf(r)) : sourceOf(r))
  const M = [
    ['the exemption widened to every string', { judge: must("if (inMsg && (n.type === 'StringLiteral'", "if ((n.type === 'StringLiteral'") }],
    ['console exempted too', { judge: must("const isMsg = n.type === 'NewExpression' && n.callee?.type === 'Identifier' && MESSAGE_CALLEE.test(n.callee.name)", "const isMsg = (n.type === 'NewExpression' && n.callee?.type === 'Identifier' && MESSAGE_CALLEE.test(n.callee.name)) || (n.type === 'CallExpression' && n.callee?.object?.name === 'console')") }],
    ['a ${} exempted', { judge: must("if (inMsg && (n.type === 'StringLiteral' || n.type === 'TemplateElement'))", "if (inMsg && (n.type === 'StringLiteral' || n.type === 'TemplateLiteral'))") }],
    ['the bridge dropped', { judge: must('if (typeof h === \'string\' && h.startsWith(EXEC_PREFIX) && OLDER_FORM(was) && abs.has(p)) {', 'if (false) {') }],
    ['a git failure read as not found', { judge: must("} catch (e) { out = { error: String(e.message).split('\\n')[0] } }", '} catch (e) { out = null }') }],
    ['a planted .message store, unannotated', { read: reading('cartograph/bake-labels.js', (t) => t + "\nexport function plantedStore(e, out) { out.why = e.message; return out }\n") }],
    ['an annotated function edited, not re-pinned', { read: reading('src/lib/tileGround.js', must('if (onAbsorbRefusal) onAbsorbRefusal({ ...absorbIn, blocks, blockHoles, error: e.message })', 'if (onAbsorbRefusal) onAbsorbRefusal({ ...absorbIn, blocks, error: e.message })')) }],
    ['an annotation copied onto another function', { read: reading('cartograph/elevationSources.mjs', (t) => t.replace(/message-flow\([0-9a-f]{8}\)/, () => `message-flow(${/message-flow\(([0-9a-f]{8})\)/.exec(sourceOf('cartograph/openClose.mjs'))[1]})`)) }],
    ['an annotation removed', { read: reading('cartograph/openClose.mjs', (t) => t.replace(/\/\/ message-flow\([0-9a-f]{8}\):[^\n]*/, '//')) }],
    ['the refusal relay unannotated', { read: reading('cartograph/serve.js', (t) => t.replace(/\/\* message-flow\([0-9a-f]{8}\):[^*]*\*\//, '/* */')) }],
    ['an annotation with nothing to vouch for', { read: reading('cartograph/bake-labels.js', (t) => t + "\nexport function vouchesForNothing() {\n  // message-flow(00000000): nowhere\n  return 1\n}\n") }],
  ]
  for (const [name, m] of M) {
    let f
    try { f = await verdict(m) } catch (e) { f = [`threw: ${e.message}`] }
    const fresh = f.filter((x) => !fails.includes(x))
    console.log(`${fresh.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${fresh.length ? ` (${fresh[0].slice(0, 110)})` : ''}`)
    if (!fresh.length) bad = 1
  }
}
process.exit(bad)
