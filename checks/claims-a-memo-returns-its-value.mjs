// claims-a-memo-returns-its-value.mjs — DOES EVERY useMemo HAND BACK WHAT IT COMPUTES?
//
// ⭐ THE CLASS: a `useMemo` callback with a BLOCK body and no `return` of a value is always `undefined`, so whatever reads it
// sees nothing and, if it guards with `if (x)`, quietly does nothing. That is never intended. MEASURED, the instance that
// founded it: 34f8931d (2026-10-06, "aGroundRaw becomes aGround") rewrote InstancedTrees.jsx#VariantInstances' groundRaws memo
// and dropped its `return arr`, so `if (groundRaws) geometry.setAttribute('aGround', …)` never ran and every MESH tree's shader
// lift read WebGL's default 0: the trees stood at y = 0 whatever the terrain, from that commit until this check (Groyne,
// 2026-10-29). ⛔ No list of files: every useMemo under src/, read by the parser.
// Judged: every `useMemo(…)` whose VALUE IS READ (not a bare statement) and whose callback has a block body must contain a
// `return <value>` belonging to that callback itself (not to a nested function). An expression body returns by construction.
// A bare `useMemo(() => { … })` statement discards its value by design (a side effect run on its deps); it is not this class
// and is counted apart, not judged.
// ⭐ PLANTED (always run): a block that returns → GREEN; a block that computes and does not → RED; a return only inside a
// nested function → RED. MUTANT (--mutants): VariantInstances' `return arr` removed → RED.
// ▶ node checks/claims-a-memo-returns-its-value.mjs [--mutants]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser'), traverse = require('@babel/traverse').default

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TREES = join(ROOT, 'src/components/InstancedTrees.jsx')
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n)
  if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js|jsx)$/.test(n)) files.push(p) } }
walk(join(ROOT, 'src'))

/** every useMemo whose block-bodied callback returns no value: [{ file, line }] */
function silent(file, src) {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true }), out = []
  let n = 0, bare = 0
  traverse(ast, { CallExpression(p) {
    const c = p.node.callee, name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null
    if (name !== 'useMemo') return
    const cb = p.get('arguments.0'); if (!cb?.isFunction?.()) return
    if (p.parentPath.isExpressionStatement()) { bare++; return }   // its value is never read
    n++
    if (cb.node.body.type !== 'BlockStatement') return                       // an expression body returns itself
    let returns = false
    cb.traverse({ ReturnStatement(q) { if (q.getFunctionParent() === cb && q.node.argument) returns = true } })
    if (!returns) out.push({ file: relative(ROOT, file), line: cb.node.loc?.start.line })
  } })
  return { out, n, bare }
}

const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
console.log('── every useMemo returns what it computes (src/)')
let total = 0, bare = 0; const hits = []
for (const f of files) { const r = silent(f, readFileSync(f, 'utf8')); total += r.n; bare += r.bare; hits.push(...r.out) }
say(total > 0, `${total} useMemo value(s) read in ${files.length} files (and ${bare} bare useMemo statement(s), whose value nothing reads, not judged)`)
say(hits.length === 0, `${hits.length} return nothing${hits.map(h => `\n       ⛔ ${h.file}:${h.line}`).join('')}`)

console.log('── planted')
const plant = (body) => silent('planted.jsx', `function P() { const v = useMemo(() => {${body}}, []) }`).out.length
say(plant('const a = 1; return a') === 0, 'a block that returns → GREEN')
say(plant('const a = new Float32Array(3)') === 1, 'a block that computes and does not → RED')
say(plant('const f = () => { return 1 }; f()') === 1, 'a return only inside a nested function → RED')
say(silent('planted.jsx', 'function P() { useMemo(() => { const a = 1 }, []) }').out.length === 0, 'a bare useMemo statement (its value unread) → not judged')

if (process.argv.includes('--mutants')) {
  console.log('── mutants (each must turn it RED)')
  // located by the memo, not by its body's text (which the fallback's removal rewrote): the first `return arr` after it
  const src = readFileSync(TREES, 'utf8'), at = src.indexOf('const groundRaws = useMemo('), ret = at < 0 ? -1 : src.indexOf('    return arr\n', at)
  if (at < 0 || ret < 0 || ret > src.indexOf('}, [instances])', at)) { say(false, "mutant anchor gone from InstancedTrees.jsx: VariantInstances' groundRaws memo and its `return arr`") }
  else { const r = silent(TREES, src.slice(0, ret) + src.slice(ret + '    return arr\n'.length))
    console.log(`  mutant: VariantInstances' return arr removed → ${r.out.length ? 'RED ✓' : 'GREEN ✗'}`); if (!r.out.length) bad.push('a mutant survived') }
}
console.log(bad.length ? `⛔ ${bad.length} failed` : '✅ every useMemo returns what it computes')
process.exit(bad.length ? 1 : 0)
